"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button, Pill } from "@/components/ui/primitives";

/**
 * Sign-up, DEMO MODE mock.
 * Name + email inputs are decorative (never read, never posted). No password
 * is ever collected. "Create demo account" simply routes into onboarding.
 * Nothing here touches the network.
 */
export default function SignUp() {
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
              Create your demo account
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              We&apos;ll load a sample profile so you can explore right away.
            </p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              // Demo mock, never submits credentials anywhere.
              e.preventDefault();
              router.push("/onboarding");
            }}
          >
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700"
              >
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Ava Chen"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              />
            </div>

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
                Nothing is stored, no password, no real account.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full">
              Create demo account <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have one?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-brand-600 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
