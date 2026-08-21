import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatLags overlay",
  description: "Mini HUD in-game : ping et process qui fait sauter la latence.",
};

export default function OverlayLayout({ children }: { children: ReactNode }) {
  return children;
}
