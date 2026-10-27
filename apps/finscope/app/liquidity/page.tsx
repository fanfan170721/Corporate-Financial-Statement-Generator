import type { Metadata } from "next";
import LiquidityLab from "@/components/liquidity-lab";
export const metadata: Metadata = { title: "Liquidity & commitments", description: "Reconcile pension benefits, contributions and private-market calls across a 24-month liquidity stress scenario." };
export default function LiquidityPage() { return <LiquidityLab />; }
