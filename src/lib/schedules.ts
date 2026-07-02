import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ScheduleRow {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string;
  schedule_date: string;
  activity_time: string;
  location: string;
  category: string;
  memo: string;
  minutes: string;
  photo_urls: string;
  created_at: string;
  updated_at: string;
}

const SCHEDULE_COLUMNS =
  "id, organization_id, created_by, title, description, schedule_date, activity_time, location, category, memo, minutes, photo_urls, created_at, updated_at";

export async function listSchedules(): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("schedules")
    .select(SCHEDULE_COLUMNS)
    .order("schedule_date", { ascending: true })
    .order("created_at", { ascending: true });

  return (data ?? []) as ScheduleRow[];
}
