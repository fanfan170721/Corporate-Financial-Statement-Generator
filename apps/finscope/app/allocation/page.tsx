import type { Metadata } from "next";
import AllocationLab from "@/components/allocation-lab";

export const metadata: Metadata = {
  title: "Asset–liability lab",
  description: "Explore allocation, duration exposure and funded status through transparent, editable institutional investment scenarios.",
};

export default function AllocationPage() {
  return <AllocationLab />;
}
