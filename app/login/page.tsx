import { Suspense } from "react";
import { LoginPage } from "@/components/auth/LoginPage";

export const metadata = { title: "Sign in · Smart Resort 360" };

export default function Login() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
