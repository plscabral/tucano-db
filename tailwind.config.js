import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- shadcn semantic tokens (driven by CSS vars in styles.css) ---
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // --- Tucano brand palettes (components reference text-ink-500,
        // bg-tucano-400, etc. directly) ---
        // Deep, slightly-cool ink for the dark canvas — distinct from navy.
        ink: {
          DEFAULT: "#080D1B",
          50: "#EDEEF3",
          100: "#C7C9D6",
          200: "#7A8099",
          300: "#373C56",
          400: "#141A2E",
          500: "#080D1B",
          600: "#080D1B",
          700: "#080D1B",
          800: "#03050A",
          900: "#010205",
        },
        // Tucano *DB* brand accent — a muted teal-cyan anchored on
        // oklch(0.62 0.115 205). Lightness ramps 0.97 → 0.25, chroma peaks at
        // the 400 step. The token key is `tucano` so the whole app maps to the
        // brand accent with no per-component churn.
        tucano: {
          DEFAULT: "oklch(0.62 0.115 205)",
          50: "oklch(0.97 0.02 205)",
          100: "oklch(0.93 0.04 205)",
          200: "oklch(0.86 0.07 205)",
          300: "oklch(0.74 0.1 205)",
          400: "oklch(0.62 0.115 205)",
          500: "oklch(0.55 0.115 205)",
          600: "oklch(0.48 0.105 205)",
          700: "oklch(0.4 0.09 205)",
          800: "oklch(0.32 0.07 205)",
          900: "oklch(0.25 0.05 205)",
        },
        // Companion warm accent (selection / subtle gradients) — sits opposite
        // the teal on the wheel so highlights read clearly.
        coral: {
          400: "#FF8A7A",
          500: "#FF6B5B",
          600: "#E64A3D",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
        accent: ["Newsreader", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 24px -6px oklch(0.62 0.115 205 / 0.55)",
        soft: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 1px 3px rgb(0 0 0 / 0.20)",
        elev: "0 12px 40px -12px rgb(0 0 0 / 0.55), 0 1px 0 rgb(255 255 255 / 0.04) inset",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
