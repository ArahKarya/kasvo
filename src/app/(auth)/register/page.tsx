import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/app/actions/auth";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  const { t } = await getDictionary();
  return (
    <>
      <h1 className="mb-5 text-lg font-bold">{t.auth.register}</h1>
      <AuthForm
        action={registerAction}
        submit={t.auth.register}
        switchText={t.auth.haveAccount}
        switchLabel={t.auth.login}
        switchHref="/login"
        fields={[
          { name: "name", label: t.auth.name, type: "text", autoComplete: "name" },
          { name: "email", label: t.auth.email, type: "email", autoComplete: "email" },
          { name: "password", label: t.auth.password, type: "password", autoComplete: "new-password", hint: t.auth.passwordHint, minLength: 8 },
        ]}
      />
    </>
  );
}
