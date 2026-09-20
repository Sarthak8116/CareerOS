"use client";

/**
 * Reusable application answer library (§5.9).
 *
 * A small localStorage-backed store for the questions candidates get asked over
 * and over on job applications ("Why do you want to work here?", work
 * authorization, etc.). Saving an answer once lets the autofill review flow
 * pre-populate future applications, but the candidate ALWAYS reviews before
 * anything is submitted. Nothing here submits an application.
 *
 * Demo-mode rules (build directive §18):
 *  - Deterministic ids via slugId; NO new Date(), updatedAt is a fixed string.
 *  - Seeded answers are grounded in demoCandidate and honest. They are drafts
 *    the candidate is expected to edit, never fabricated experience.
 */

import { z } from "zod";
import { ApplicationAnswer } from "@/lib/types";
import { slugId } from "@/lib/utils";
import { demoCandidate } from "@/lib/demo/candidate";

const STORAGE_KEY = "careeros:answers:v1";

/** Fixed timestamp for deterministic demo data (no new Date). */
const SEED_UPDATED_AT = "2026-06-01";

const AnswerList = z.array(ApplicationAnswer);

/* ------------------------------------------------------------------ */
/* Seed data, grounded in demoCandidate, drafted honestly.            */
/* ------------------------------------------------------------------ */

const c = demoCandidate;

const SEED: ApplicationAnswer[] = [
  {
    id: slugId("ans", "why-work-here"),
    question: "Why do you want to work here?",
    answer:
      "I'm drawn to teams working on systems and AI infrastructure, the space " +
      "where my cache simulator and from-scratch neural-network library both " +
      "come from. I'd like to spend an internship going deep on performance-" +
      "critical software alongside engineers who do this full time. (Edit this " +
      "per company, name the specific product or team that pulled you in.)",
    tags: ["motivation", "cover-letter"],
    updatedAt: SEED_UPDATED_AT,
  },
  {
    id: slugId("ans", "challenging-project"),
    question: "Describe a challenging project you worked on.",
    answer:
      "I built a CPU cache simulator in C that models set associativity and " +
      "several replacement policies, then validated it against reference traces. " +
      "The hardest part was reasoning about eviction edge cases, I ended up " +
      "writing targeted tests for each policy so I could trust the hit-rate " +
      "numbers it reported. It's on my GitHub (" +
      (c.links.github ?? "github profile") +
      "/cachesim).",
    tags: ["behavioral", "project"],
    updatedAt: SEED_UPDATED_AT,
  },
  {
    id: slugId("ans", "work-authorization"),
    question: "What is your work authorization status?",
    answer: c.workAuthorization,
    tags: ["logistics", "work-authorization"],
    updatedAt: SEED_UPDATED_AT,
  },
  {
    id: slugId("ans", "preferred-location"),
    question: "What is your preferred work location?",
    answer:
      "Open to on-site or hybrid roles; currently based in " +
      c.location +
      ". Happy to relocate for a summer internship.",
    tags: ["logistics", "location"],
    updatedAt: SEED_UPDATED_AT,
  },
  {
    id: slugId("ans", "years-cpp"),
    question: "How many years of experience do you have with C/C++?",
    answer:
      "About one to two years of hands-on C through systems coursework and " +
      "projects (a cache simulator and a memory allocator). My C++ exposure is " +
      "more limited, one semester of a systems course. I'd describe C as a " +
      "working strength and C++ as still developing.",
    tags: ["skills", "experience"],
    updatedAt: SEED_UPDATED_AT,
  },
  {
    id: slugId("ans", "greatest-strength"),
    question: "What is your greatest strength?",
    answer:
      "Getting to the bottom of how systems actually behave. When I built my " +
      "neural-network training library from scratch in NumPy, I wanted to " +
      "understand backprop rather than call a framework, that same instinct " +
      "shows up in my systems work. (Keep this honest and specific to you.)",
    tags: ["behavioral", "strengths"],
    updatedAt: SEED_UPDATED_AT,
  },
];

/* ------------------------------------------------------------------ */
/* Storage helpers (SSR-guarded).                                      */
/* ------------------------------------------------------------------ */

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function read(): ApplicationAnswer[] {
  if (!hasStorage()) return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      write(SEED);
      return SEED;
    }
    const parsed = AnswerList.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // Corrupt/invalid stored data, reset to seed rather than throw.
      write(SEED);
      return SEED;
    }
    return parsed.data;
  } catch {
    write(SEED);
    return SEED;
  }
}

function write(answers: ApplicationAnswer[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Storage full / unavailable, non-fatal in demo mode.
  }
}

/* ------------------------------------------------------------------ */
/* Public API.                                                         */
/* ------------------------------------------------------------------ */

export function getAnswers(): ApplicationAnswer[] {
  return read();
}

export function upsertAnswer(input: {
  id?: string;
  question: string;
  answer: string;
  tags?: string[];
}): ApplicationAnswer {
  const answers = read();

  const question = input.question.trim();
  const answer = input.answer.trim();
  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);

  // Deterministic id: reuse provided id, else derive from the question so the
  // same question maps to a stable id (no new Date, no Math.random).
  const id = input.id ?? slugId("ans", question.toLowerCase());

  const record = ApplicationAnswer.parse({
    id,
    question,
    answer,
    tags,
    updatedAt: SEED_UPDATED_AT,
  });

  const idx = answers.findIndex((a) => a.id === id);
  const next =
    idx === -1
      ? [...answers, record]
      : answers.map((a) => (a.id === id ? record : a));

  write(next);
  return record;
}

export function removeAnswer(id: string): void {
  const answers = read();
  write(answers.filter((a) => a.id !== id));
}
