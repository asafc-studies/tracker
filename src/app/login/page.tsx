import { signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 30%, rgba(125,211,192,0.18), transparent 60%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm text-center space-y-8">
        <div>
          <p
            className="font-[family-name:var(--font-syne)] text-4xl md:text-5xl font-semibold tracking-tight text-[var(--foreground)]"
          >
            Recomp Tracker
          </p>
          <p className="mt-3 text-[var(--muted)] text-sm leading-relaxed">
            Protein-first logging for recomp. Same Google account syncs phone
            and browser.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--accent)] text-[var(--background)] py-3 text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity"
          >
            Continue with Google
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Data stays on your server. We only use Google for sign-in — no
          passwords stored here.
        </p>
      </div>
    </div>
  );
}
