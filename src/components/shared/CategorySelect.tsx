"use client";
import React from 'react';

export const CATEGORY_OPTIONS = [
  'Mathematik','Musik','Deutsch','Englisch','Geographie','Geschichte','Physik','Chemie','Biologie','Kunst','sonstiges'
] as const;

interface Props {
  value: string;
  onChange: (v: string)=>void;
  labelClassName?: string;
  selectClassName?: string;
  label?: string;
  required?: boolean;
}

export default function CategorySelect({ value, onChange, label='Kategorie', required, labelClassName='block text-xs font-semibold text-gray-600 mb-1', selectClassName='w-full p-2 border rounded text-sm' }: Props){
  return (
    <div className="min-w-[200px]">
      <label className={labelClassName}>{label}{required && ' *'}</label>
      <select value={value} onChange={e=>onChange(e.target.value)} className={selectClassName}>
        {CATEGORY_OPTIONS.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}
