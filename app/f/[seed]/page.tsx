import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { decodeSeed } from "@/lib/prng";
import FishFrame from "@/components/FishFrame";
import FishCanvas from "@/components/FishCanvas";

// A shared fish. This route is NOT time gated: you can admire a shared fish any
// time of day. Only making a NEW fish is gated to 11:11. The fish is fully
// determined by the seed in the URL, so no database is needed.

export function generateMetadata({ params }: { params: { seed: string } }): Metadata {
  return {
    title: "a fish",
    description: `fish ${params.seed} from 11:11 make a fish`,
  };
}

export default function SharedFishPage({ params }: { params: { seed: string } }) {
  const seed = decodeSeed(params.seed);
  if (seed == null) notFound();

  return (
    <>
      <FishFrame>
        <FishCanvas seed={seed} />
      </FishFrame>
      <p className="make-your-own">
        <a href="/">make your own at 11:11</a>
      </p>
    </>
  );
}
