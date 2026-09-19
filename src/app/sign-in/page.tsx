"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";

/**
 * Sign-in — DEMO MODE mock.
 * No credentials are collected or submitted. The email field is decorative
 * (never read, never posted). The only real action is navigation into the
 * demo app. Nothing here touches the network.
 */
export default function SignIn() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">CareerOS</span>
        </Link>

        <div className="card p-6 sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Sign in to open Mission Control.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              // Demo mock — never submits credentials anywhere.
              e.preventDefault();
              router.push("/dashboard");
            }}
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              />
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                <Pill className="bg-slate-50 text-slate-500 ring-slate-200">
                  Demo
                </Pill>
                No password needed — this is a mock sign-in.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full">
              Continue as demo user <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New here?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-brand-600 hover:underline"
            >
              Create a demo account
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Just looking?{" "}
          <Link
            href="/demo"
            className="font-medium text-slate-600 hover:underline"
          >
            Explore the demo
          </Link>
        </p>
      </div>
    </div>
  );
}
