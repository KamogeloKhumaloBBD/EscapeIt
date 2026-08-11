"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type {
  SignInActionState,
  SignInIntent,
} from "@/app/sign-in/sign-in-state";
import { requestApi } from "@/lib/server/api-client";
import { applyResponseCookies } from "@/lib/server/response-cookies";
import { emailSchema, otpSchema } from "@/lib/validation/sign-in";

const genericSignInError =
  "We couldn't complete sign in. Check your email and code, then try again.";
const genericSendError = "We couldn't send a sign-in code. Please try again.";

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readIntent(formData: FormData): SignInIntent | null {
  const intent = readString(formData, "intent");

  if (intent === "request-code" || intent === "verify-code") {
    return intent;
  }

  return null;
}

export async function signInAction(
  _previousState: SignInActionState,
  formData: FormData,
): Promise<SignInActionState> {
  const intent = readIntent(formData);

  if (intent === "request-code") {
    const email = readString(formData, "email");
    const parsed = emailSchema.safeParse({ email });

    if (!parsed.success) {
      const errors = z.treeifyError(parsed.error);

      return {
        email,
        fieldErrors: {
          email:
            errors.properties?.email?.errors[0] ??
            "Enter a valid email address.",
        },
        message: null,
        status: "error",
        step: "email",
      };
    }

    const result = await requestApi(
      "/api/auth/email-otp/send-verification-otp",
      {
        body: {
          email: parsed.data.email,
          type: "sign-in",
        },
        method: "POST",
      },
    );

    if (!result.ok) {
      return {
        email: parsed.data.email,
        fieldErrors: {},
        message: genericSendError,
        status: "error",
        step: "email",
      };
    }

    return {
      email: parsed.data.email,
      fieldErrors: {},
      message: "Check your email for a 6-digit sign-in code.",
      status: "success",
      step: "code",
    };
  }

  if (intent === "verify-code") {
    const email = readString(formData, "email");
    const code = readString(formData, "code");
    const parsed = otpSchema.safeParse({ code, email });

    if (!parsed.success) {
      const fieldErrors = z.treeifyError(parsed.error).properties;

      return {
        email,
        fieldErrors: {
          ...(fieldErrors?.code?.errors[0] === undefined
            ? {}
            : { code: fieldErrors.code.errors[0] }),
          ...(fieldErrors?.email?.errors[0] === undefined
            ? {}
            : { email: fieldErrors.email.errors[0] }),
        },
        message: null,
        status: "error",
        step: "code",
      };
    }

    const result = await requestApi("/api/auth/sign-in/email-otp", {
      body: {
        email: parsed.data.email,
        otp: parsed.data.code,
      },
      method: "POST",
    });

    if (!result.ok || result.setCookies.length === 0) {
      return {
        email: parsed.data.email,
        fieldErrors: {},
        message: genericSignInError,
        status: "error",
        step: "code",
      };
    }

    try {
      await applyResponseCookies(result.setCookies);
    } catch {
      return {
        email: parsed.data.email,
        fieldErrors: {},
        message: genericSignInError,
        status: "error",
        step: "code",
      };
    }

    redirect("/dashboard");
  }

  return {
    email: "",
    fieldErrors: {},
    message: genericSignInError,
    status: "error",
    step: "email",
  };
}
