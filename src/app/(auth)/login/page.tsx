import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions/auth";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage() {
  const { t } = await getDictionary();
  return (
    <>
      <h1 className="mb-5 text-lg font-bold">{t.auth.login}</h1>
      <AuthForm
        action={loginAction}
        submit={t.auth.login}
        switchText={t.auth.noAccount}
        switchLabel={t.auth.register}
        switchHref="/register"
        fields={[
          { name: "email", label: t.auth.email, type: "email", autoComplete: "email" },
          { name: "password", label: t.auth.password, type: "password", autoComplete: "current-password" },
        ]}
      />
    </>
  );
}
