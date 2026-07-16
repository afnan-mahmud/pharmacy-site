import { vi } from "vitest";

process.env.TZ = "Asia/Dhaka";
process.env.SESSION_SECRET ??= "test-secret-at-least-32-characters-long!!";

// Server actions call revalidatePath, which throws outside a Next.js request
// context. Mocked here rather than per-file because every action module imports
// it. Mocks declared in a setup file apply to all test files.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
