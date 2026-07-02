import type { Metadata } from "next";
import { getCurrentMember } from "@/lib/member";
import { listSchedules } from "@/lib/schedules";
import { ScheduleClient } from "./schedule-client";

export const metadata: Metadata = { title: "活動カレンダー" };

export default async function SchedulePage() {
  const member = await getCurrentMember();
  const schedules = member ? await listSchedules() : [];

  return <ScheduleClient initialSchedules={schedules} member={member} />;
}
