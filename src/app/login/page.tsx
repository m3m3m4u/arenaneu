"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await signIn("credentials", {
      redirect: false,
      username: form.username,
      password: form.password,
    });
    if (res?.error) {
      setError("Login fehlgeschlagen: " + res.error);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-6 sm:mt-10 p-4 sm:p-6 bg-white rounded shadow">
      <h2 className="text-xl sm:text-2xl font-bold mb-4">Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="username"
          placeholder="Benutzername"
          value={form.username}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          autoComplete="username"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Passwort"
          value={form.password}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          autoComplete="current-password"
          required
        />
  <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-semibold">Login</button>
      </form>
      <div className="mt-4 flex justify-end">
        <a href="/forgot-password" className="text-sm text-blue-600 font-medium underline hover:text-blue-700">Passwort vergessen?</a>
      </div>
      {error && <p className="text-red-600 mt-4">{error}</p>}
  <p className="mt-4 text-sm sm:text-base">Noch keinen Account? <a href="/register" className="text-blue-600 underline">Registrieren</a></p>
  <div className="mt-6 border-t pt-4">
        <button
          onClick={()=>{ try { localStorage.setItem('guest:active','1'); } catch {}; window.location.href = '/guest'; }}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded font-semibold"
        >Als Gast weitermachen</button>
  <p className="mt-2 text-[11px] sm:text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded p-2 leading-snug">
          Hinweis: Im Gastmodus werden Fortschritte und Einstellungen nur lokal im Browser gespeichert.
        </p>
      </div>
    </div>
  );
}
