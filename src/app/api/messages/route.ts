import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import TeacherClass from '@/models/TeacherClass';
import Message from '@/models/Message';
import mongoose, { isValidObjectId } from 'mongoose';

// GET: Eigene Nachrichten (für Learner: von Owner-Teacher und an mich; für Teacher: an/ von eigenen Lernenden/ Klassen)
export async function GET(req: Request){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meRole = (session?.user as any)?.role;
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const meObjId = new mongoose.Types.ObjectId(meId);
  const notPurged = { $or: [ { purgedFor: { $exists:false } }, { purgedFor: { $ne: meObjId } } ] } as any;
  const notHidden = { $and:[ notPurged, { $or: [ { hiddenFor: { $exists:false } }, { hiddenFor: { $ne: meObjId } } ] } ] } as any;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
  const limit = 10;
  const skip = (page-1)*limit;
  const view = url.searchParams.get('view') || 'messages';
  const inTrash = view==='trash';
  if(meRole==='learner'){
    // Eigene Nachrichten: an mich, von mir, sowie Broadcasts an meine Klasse
    const me = await User.findById(meId,'ownerTeacher class').lean();
    const meClass = me?.class ? new mongoose.Types.ObjectId(String(me.class)) : null;
    const orConds: any[] = [ { recipientUser: meObjId }, { sender: meObjId } ];
    if(meClass) orConds.push({ recipientClass: meClass });
  const base = { $and:[ (inTrash? { hiddenFor: meObjId } : notHidden), { $or: orConds } ] } as any;
    if(view==='threads'){
      // Thread-basierte Sicht: neueste Nachricht pro Thread
      const match = base;
      const commonStages: any[] = [
        { $match: match },
        { $addFields: { threadKey: { $ifNull: ['$threadId', '$_id'] } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$threadKey', latest: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$latest' } },
      ];
      const countAgg = await Message.aggregate([
        ...commonStages,
        { $count: 'count' }
      ]);
      const total = countAgg?.[0]?.count || 0;
      const msgs = await Message.aggregate([
        ...commonStages,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        // Populate sender
        { $lookup: { from: 'users', localField: 'sender', foreignField: '_id', as: 'sender' } },
        { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
        // Populate recipientUser (optional)
        { $lookup: { from: 'users', localField: 'recipientUser', foreignField: '_id', as: 'recipientUser' } },
        { $unwind: { path: '$recipientUser', preserveNullAndEmptyArrays: true } },
        // Populate recipientClass (optional)
        { $lookup: { from: 'teacherclasses', localField: 'recipientClass', foreignField: '_id', as: 'recipientClass' } },
        { $unwind: { path: '$recipientClass', preserveNullAndEmptyArrays: true } },
      ]).exec();
      return NextResponse.json({ success:true, messages: msgs, meta:{ page, limit, total, pages: Math.max(1, Math.ceil(total/limit)) } });
    } else {
      const total = await Message.countDocuments(base);
      const msgs = await Message.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('sender','username name')
        .populate('recipientUser','username name')
        .populate('recipientClass','name')
        .lean();
      return NextResponse.json({ success:true, messages: msgs, meta:{ page, limit, total, pages: Math.ceil(total/limit) } });
    }
  }
  if(meRole==='teacher' || meRole==='admin'){
    // Unterschiedliche Sicht für Teacher vs. Admin
    let base: any;
    if(meRole==='admin'){
      // Admin sieht alle Threads, an denen er beteiligt ist (Sender oder direkter Empfänger)
      base = { $and:[ (inTrash? { hiddenFor: meObjId } : notHidden), { $or:[ { sender: meObjId }, { recipientUser: meObjId } ] } ] } as any;
    } else {
      // Teacher: Nachrichten an / von eigenen Lernenden oder an eigene Klassen
      const classIds = await TeacherClass.find({ teacher: meId }, '_id').lean();
      const classSet = classIds.map((c:any)=>String(c._id));
      const learnerIds = await User.find({ ownerTeacher: meId }, '_id').lean();
      const lSet = learnerIds.map((u:any)=>String(u._id));
      base = { $and:[ (inTrash? { hiddenFor: meObjId } : notHidden), { $or:[
        { sender: meObjId },
        { recipientClass: { $in: classSet.map(id=>new mongoose.Types.ObjectId(id)) } },
        { recipientUser: { $in: lSet.map(id=>new mongoose.Types.ObjectId(id)) } },
        { sender: { $in: lSet.map(id=>new mongoose.Types.ObjectId(id)) } }
      ] } ]} as any;
    }
    if(view==='threads'){
      const match = base;
      const commonStages: any[] = [
        { $match: match },
        { $addFields: { threadKey: { $ifNull: ['$threadId', '$_id'] } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$threadKey', latest: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$latest' } },
      ];
      const countAgg = await Message.aggregate([
        ...commonStages,
        { $count: 'count' }
      ]);
      const total = countAgg?.[0]?.count || 0;
      const msgs = await Message.aggregate([
        ...commonStages,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $lookup: { from: 'users', localField: 'sender', foreignField: '_id', as: 'sender' } },
        { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'users', localField: 'recipientUser', foreignField: '_id', as: 'recipientUser' } },
        { $unwind: { path: '$recipientUser', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'teacherclasses', localField: 'recipientClass', foreignField: '_id', as: 'recipientClass' } },
        { $unwind: { path: '$recipientClass', preserveNullAndEmptyArrays: true } },
      ]).exec();
      return NextResponse.json({ success:true, messages: msgs, meta:{ page, limit, total, pages: Math.max(1, Math.ceil(total/limit)) } });
    } else {
      const total = await Message.countDocuments(base);
      const msgs = await Message.find(base).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .populate('sender','username name')
        .populate('recipientUser','username name')
        .populate('recipientClass','name')
        .lean();
      return NextResponse.json({ success:true, messages: msgs, meta:{ page, limit, total, pages: Math.ceil(total/limit) } });
    }
  }
  return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
}

// POST: Nachricht senden
// Learner -> Teacher (subject, body) | Teacher -> User (recipientUser) oder -> Class (recipientClass)
export async function POST(req: Request){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const { subject, body: text, recipientUser, recipientClass, parentMessage, action, messageId } = body as any;
  if(action==='purge'){
    const meId = (session?.user as any)?.id;
    if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
    if(!messageId) return NextResponse.json({ success:false, error:'messageId fehlt' }, { status:400 });
    const msg = await Message.findById(messageId);
    if(!msg) return NextResponse.json({ success:false, error:'Nachricht nicht gefunden' }, { status:404 });
    msg.hiddenFor = msg.hiddenFor || [] as any;
    const idx = (msg.hiddenFor as any[]).findIndex((u:any)=>String(u)===String(meId));
    if(idx<0) (msg.hiddenFor as any[]).push(meId as any);
    msg.purgedFor = msg.purgedFor || [] as any;
    const pidx = (msg.purgedFor as any[]).findIndex((u:any)=>String(u)===String(meId));
    if(pidx<0) (msg.purgedFor as any[]).push(meId as any);
    await msg.save();
    return NextResponse.json({ success:true });
  }
  if(!subject || !text) return NextResponse.json({ success:false, error:'subject/body fehlt' }, { status:400 });
  // Falls parentMessage gesetzt, hole threadId des Elternteils
  let threadId: any = undefined;
  if(parentMessage){
    const parent = await Message.findById(parentMessage,'threadId');
    if(parent){ threadId = parent.threadId || parent._id; }
  }
  if(role==='learner'){
    // Lernender sendet in der Regel an Owner-Teacher. Antwortet er aber auf eine Nachricht eines Admin/Teachers, soll an diesen gesendet werden.
    let targetUser: any = null;
    if(parentMessage){
      const parent = await Message.findById(parentMessage, 'sender recipientUser recipientClass');
      if(parent){
        // Sender der Eltern-Nachricht ist Ziel, sofern nicht der Lernende selbst
        if(String(parent.sender) !== String(meId)) targetUser = parent.sender;
      }
    }
    if(!targetUser){
      const me = await User.findById(meId, 'ownerTeacher');
      if(!me?.ownerTeacher) return NextResponse.json({ success:false, error:'Kein zugewiesener Teacher' }, { status:400 });
      targetUser = me.ownerTeacher;
    }
    const msg = await Message.create({ sender: meId, recipientUser: targetUser, subject, body: text, parentMessage: parentMessage||undefined, threadId });
    return NextResponse.json({ success:true, messageId: String(msg._id) });
  }
  if(role==='teacher' || role==='admin'){
    // Admin darf jede Klasse / jeden Nutzer adressieren. Teacher nur eigene Klassen / Lernende (oder Admin bei Reply).
    if(recipientClass){
      if(!isValidObjectId(recipientClass)) return NextResponse.json({ success:false, error:'Ungültige Klassen-ID' }, { status:400 });
      let cls: any = null;
      if(role==='admin'){
        cls = await TeacherClass.findById(recipientClass, '_id');
      } else {
        cls = await TeacherClass.findOne({ _id: recipientClass, teacher: meId }, '_id');
      }
      if(!cls) return NextResponse.json({ success:false, error:'Klasse nicht gefunden' }, { status:404 });
      const msg = await Message.create({ sender: meId, recipientClass: cls._id, subject, body: text, parentMessage: parentMessage||undefined, threadId });
      return NextResponse.json({ success:true, messageId: String(msg._id) });
    }
    if(recipientUser){
      if(!isValidObjectId(recipientUser)) return NextResponse.json({ success:false, error:'Ungültige User-ID' }, { status:400 });
      let allowed = false; let target: any = null;
      const user = await User.findById(recipientUser, 'role ownerTeacher');
      if(user){
        if(role==='admin'){
          // Admin darf alle Teacher & Learner ansprechen
            if(user.role==='learner' || user.role==='teacher') allowed = true;
        } else {
          // Teacher darf eigenen Lernenden ansprechen oder Admin als Reply (s.u.)
          if(String(user.ownerTeacher) === String(meId)) allowed = true;
          if(user.role==='admin' && parentMessage){
            // Reply an Admin erlaubt wenn ursprüngliche Nachricht von Admin
            const parent = await Message.findById(parentMessage, 'sender');
            if(parent && String(parent.sender) === String(user._id)) allowed = true;
          }
        }
        if(allowed) target = user._id;
      }
      if(!allowed) return NextResponse.json({ success:false, error: role==='admin'? 'Zielrolle nicht erlaubt (nur Lehrer/Lernende)': 'Empfänger nicht gefunden / nicht zugeordnet' }, { status:404 });
      const msg = await Message.create({ sender: meId, recipientUser: target, subject, body: text, parentMessage: parentMessage||undefined, threadId });
      return NextResponse.json({ success:true, messageId: String(msg._id) });
    }
    return NextResponse.json({ success:false, error:'recipientUser oder recipientClass erforderlich' }, { status:400 });
  }
  return NextResponse.json({ success:false, error:'Unauthorized' }, { status:403 });
}

// PATCH: Nachricht als gelesen/ungelesen markieren
export async function PATCH(req: Request){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const { messageId, read } = body as any;
  if(!messageId) return NextResponse.json({ success:false, error:'messageId fehlt' }, { status:400 });
  const msg = await Message.findById(messageId);
  if(!msg) return NextResponse.json({ success:false, error:'Nachricht nicht gefunden' }, { status:404 });
  msg.readBy = msg.readBy || [] as any;
  const idx = (msg.readBy as any[]).findIndex((u:any)=>String(u)===String(meId));
  if(read){ if(idx<0) (msg.readBy as any[]).push(meId as any); }
  else { if(idx>=0) (msg.readBy as any[]).splice(idx,1); }
  await msg.save();
  return NextResponse.json({ success:true });
}

// DELETE: Nachricht verstecken (soft delete für den aktuellen Nutzer)
export async function DELETE(req: Request){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const { messageId } = body as any;
  if(!messageId) return NextResponse.json({ success:false, error:'messageId fehlt' }, { status:400 });
  const msg = await Message.findById(messageId);
  if(!msg) return NextResponse.json({ success:false, error:'Nachricht nicht gefunden' }, { status:404 });
  msg.hiddenFor = msg.hiddenFor || [] as any;
  const idx = (msg.hiddenFor as any[]).findIndex((u:any)=>String(u)===String(meId));
  if(idx<0) (msg.hiddenFor as any[]).push(meId as any);
  await msg.save();
  return NextResponse.json({ success:true });
}

// RESTORE: Nachricht aus dem Papierkorb wiederherstellen
export async function PUT(req: Request){
  try{ await dbConnect(); } catch(e:any){ return NextResponse.json({ success:false, error:'DB '+(e?.message||e) }, { status:500 }); }
  const session = await getServerSession(authOptions);
  const meId = (session?.user as any)?.id;
  if(!meId) return NextResponse.json({ success:false, error:'Unauthorized' }, { status:401 });
  const body = await req.json().catch(()=>({}));
  const { messageId } = body as any;
  if(!messageId) return NextResponse.json({ success:false, error:'messageId fehlt' }, { status:400 });
  const msg = await Message.findById(messageId);
  if(!msg) return NextResponse.json({ success:false, error:'Nachricht nicht gefunden' }, { status:404 });
  msg.hiddenFor = (msg.hiddenFor||[] as any[]).filter((u:any)=> String(u)!==String(meId)) as any;
  await msg.save();
  return NextResponse.json({ success:true });
}

// Hinweis: Endgültiges Löschen erfolgt jetzt über POST { action:'purge', messageId }
