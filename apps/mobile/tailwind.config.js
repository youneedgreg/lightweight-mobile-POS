/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // Native always follows the phone's light/dark setting. "class" only affects the
  // web preview, where "media" crashes NativeWind when styles load lazily.
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};
