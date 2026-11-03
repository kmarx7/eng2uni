import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/admin/LoginForm";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  // Request time, so a production server answers 404 instead of a prerendered form.
  await connection();
  if (process.env.NODE_ENV === "production") notFound();
  return <LoginForm />;
}
