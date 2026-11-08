import { createFileRoute } from "@tanstack/react-router";
import { EzzApp } from "@/components/ezz-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <EzzApp />;
}
