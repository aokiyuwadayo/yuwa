"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addMonths,
  buildCalendarMonth,
  categoryClassName,
  categoryLabel,
  escapeIcs,
  nextDate,
  scheduleCategories,
  toIsoDate,
} from "@/lib/schedule-calendar";
import type { CurrentMember } from "@/lib/member";
import type { ScheduleRow } from "@/lib/schedules";

interface ScheduleClientProps {
  initialSchedules: ScheduleRow[];
  member: CurrentMember | null;
}

interface ScheduleDraft {
  title: string;
  description: string;
  schedule_date: string;
  activity_time: string;
  location: string;
  category: string;
  memo: string;
  minutes: string;
  photo_urls: string;
}

const emptyDraft = (date: string): ScheduleDraft => ({
  title: "",
  description: "",
  schedule_date: date,
  activity_time: "",
  location: "",
  category: "regular",
  memo: "",
  minutes: "",
  photo_urls: "",
});

function draftFromSchedule(schedule: ScheduleRow): ScheduleDraft {
  return {
    title: schedule.title,
    description: schedule.description,
    schedule_date: schedule.schedule_date,
    activity_time: schedule.activity_time,
    location: schedule.location,
    category: schedule.category,
    memo: schedule.memo,
    minutes: schedule.minutes,
    photo_urls: schedule.photo_urls,
  };
}

function monthKey(year: number, monthIndex: number) {
  return `${year}-${monthIndex}`;
}

function buildIcs(schedules: ScheduleRow[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wacca Schedule//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  schedules.forEach((schedule) => {
    const description = [
      schedule.description,
      schedule.memo ? `メモ: ${schedule.memo}` : "",
      schedule.minutes ? `議事録: ${schedule.minutes}` : "",
      schedule.photo_urls ? `写真・共有フォルダ: ${schedule.photo_urls}` : "",
      `分類: ${categoryLabel(schedule.category)}`,
      schedule.activity_time ? `活動時間: ${schedule.activity_time}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${schedule.id}@wacca-schedule`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${schedule.schedule_date.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${nextDate(schedule.schedule_date).replaceAll("-", "")}`,
      `SUMMARY:${escapeIcs(schedule.title)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `LOCATION:${escapeIcs(schedule.location)}`,
      `CATEGORIES:${escapeIcs(categoryLabel(schedule.category))}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function ScheduleClient({ initialSchedules, member }: ScheduleClientProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const now = new Date();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [viewMonth, setViewMonth] = useState({
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
  });
  const [selectedDate, setSelectedDate] = useState(toIsoDate(now));
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft(toIsoDate(now)));
  const [status, setStatus] = useState(
    member ? "同期待機中" : "ログインすると同期できます",
  );
  const [isSaving, setIsSaving] = useState(false);

  const calendarMonth = useMemo(
    () => buildCalendarMonth(viewMonth.year, viewMonth.monthIndex),
    [viewMonth],
  );

  const schedulesByDate = useMemo(() => {
    return schedules.reduce<Record<string, ScheduleRow[]>>((acc, schedule) => {
      acc[schedule.schedule_date] ??= [];
      acc[schedule.schedule_date].push(schedule);
      return acc;
    }, {});
  }, [schedules]);

  const selectedDaySchedules = schedulesByDate[selectedDate] ?? [];

  useEffect(() => {
    if (!member) {
      return;
    }

    const refresh = async () => {
      const { data } = await supabase
        .from("schedules")
        .select("*")
        .order("schedule_date", { ascending: true })
        .order("created_at", { ascending: true });
      setSchedules((data ?? []) as ScheduleRow[]);
    };

    const channel = supabase
      .channel(`schedules:${member.organization_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "schedules",
          filter: `organization_id=eq.${member.organization_id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe((subscriptionStatus) => {
        setStatus(subscriptionStatus === "SUBSCRIBED" ? "共同編集中" : "同期接続中");
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [member, supabase]);

  function selectDate(date: string) {
    const firstSchedule = (schedulesByDate[date] ?? [])[0] ?? null;
    setSelectedDate(date);
    setSelectedScheduleId(firstSchedule?.id ?? null);
    setDraft(firstSchedule ? draftFromSchedule(firstSchedule) : emptyDraft(date));
  }

  function selectSchedule(schedule: ScheduleRow) {
    setSelectedDate(schedule.schedule_date);
    setSelectedScheduleId(schedule.id);
    setDraft(draftFromSchedule(schedule));
  }

  function startNewSchedule() {
    setSelectedScheduleId(null);
    setDraft(emptyDraft(selectedDate));
  }

  function moveMonth(amount: number) {
    setViewMonth((current) => addMonths(current.year, current.monthIndex, amount));
  }

  async function saveSchedule() {
    if (!member) return;
    const title = draft.title.trim();
    if (!title) {
      setStatus("タイトルを入力してください");
      return;
    }

    setIsSaving(true);
    const payload = {
      title,
      description: draft.description.trim(),
      schedule_date: draft.schedule_date,
      activity_time: draft.activity_time.trim(),
      location: draft.location.trim(),
      category: draft.category,
      memo: draft.memo.trim(),
      minutes: draft.minutes.trim(),
      photo_urls: draft.photo_urls.trim(),
    };

    const result = selectedScheduleId
      ? await supabase.from("schedules").update(payload).eq("id", selectedScheduleId)
      : await supabase
          .from("schedules")
          .insert({
            ...payload,
            organization_id: member.organization_id,
            created_by: member.id,
          })
          .select("*")
          .single();

    setIsSaving(false);

    if (result.error) {
      setStatus("保存に失敗しました");
      return;
    }

    if (!selectedScheduleId && "data" in result && result.data) {
      const created = result.data as ScheduleRow;
      setSelectedScheduleId(created.id);
      setSchedules((current) => [...current, created]);
    }
    if (selectedScheduleId) {
      setSchedules((current) =>
        current.map((schedule) =>
          schedule.id === selectedScheduleId
            ? { ...schedule, ...payload, updated_at: new Date().toISOString() }
            : schedule,
        ),
      );
    }
    setStatus("保存しました");
  }

  async function deleteSchedule() {
    if (!selectedScheduleId) return;
    const deletedId = selectedScheduleId;
    const { error } = await supabase.from("schedules").delete().eq("id", deletedId);
    if (error) {
      setStatus("削除に失敗しました");
      return;
    }
    setSchedules((current) => current.filter((schedule) => schedule.id !== deletedId));
    setSelectedScheduleId(null);
    setDraft(emptyDraft(selectedDate));
    setStatus("削除しました");
  }

  function exportIcs() {
    if (!schedules.length) {
      setStatus("書き出す予定がありません");
      return;
    }

    const blob = new Blob([buildIcs(schedules)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wacca-schedule-${new Date().toISOString().slice(0, 10)}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("ICSを書き出しました");
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-brand-50 via-white to-warm-50 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
            Schedule
          </p>
          <h1 className="font-display text-3xl font-extrabold text-foreground">
            活動カレンダー
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            部会、作業会、発表準備、外部イベントなどを月間カレンダーで管理します。
            予定は同じサークルのメンバーにリアルタイムで反映されます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            {status}
          </span>
          <Button type="button" variant="outline" onClick={exportIcs}>
            <Download />
            Googleカレンダー
          </Button>
        </div>
      </header>

      {!member && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            活動カレンダーの閲覧・編集にはログインが必要です。
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl font-bold">
                <CalendarDays className="size-5 text-brand-600" />
                {calendarMonth.label}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                日付を選ぶと右側で予定を作成・編集できます。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => moveMonth(-1)}>
                <ChevronLeft />
                前月
              </Button>
              <Button type="button" variant="outline" onClick={() => moveMonth(1)}>
                次月
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 border-y text-center text-xs font-bold text-muted-foreground">
              {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-x border-b">
              {calendarMonth.cells.map((cell) => {
                const daySchedules = schedulesByDate[cell.date] ?? [];
                const isSelected = selectedDate === cell.date;
                return (
                  <button
                    key={`${monthKey(calendarMonth.year, calendarMonth.monthIndex)}-${cell.date}`}
                    type="button"
                    onClick={() => selectDate(cell.date)}
                    className={[
                      "min-h-28 border-r border-b p-2 text-left transition hover:bg-brand-50",
                      cell.weekday === 6 ? "border-r-0" : "",
                      cell.isCurrentMonth ? "bg-white" : "bg-muted/40 text-muted-foreground",
                      isSelected ? "ring-2 ring-inset ring-brand-600" : "",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-bold">{cell.day}</span>
                      {daySchedules.length > 0 && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                          {daySchedules.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {daySchedules.slice(0, 3).map((schedule) => (
                        <span
                          key={schedule.id}
                          className={`truncate rounded-md px-2 py-1 text-xs font-bold ${categoryClassName(schedule.category)}`}
                        >
                          {schedule.title}
                        </span>
                      ))}
                      {daySchedules.length > 3 && (
                        <span className="text-xs font-semibold text-muted-foreground">
                          +{daySchedules.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>予定詳細</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selectedDate}
                {selectedDaySchedules.length > 0
                  ? ` / ${selectedDaySchedules.length}件`
                  : " / 未登録"}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {selectedDaySchedules.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedDaySchedules.map((schedule) => (
                    <Button
                      key={schedule.id}
                      type="button"
                      variant={selectedScheduleId === schedule.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => selectSchedule(schedule)}
                    >
                      {schedule.title}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startNewSchedule}
                  >
                    <Plus />
                    新規
                  </Button>
                </div>
              )}

              <div className="grid gap-3">
                <Label>
                  タイトル
                  <Input
                    value={draft.title}
                    placeholder="例: ピッチ練習会"
                    disabled={!member}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Label>
                    日付
                    <Input
                      type="date"
                      value={draft.schedule_date}
                      disabled={!member}
                      onChange={(event) => {
                        const date = event.target.value;
                        setSelectedDate(date);
                        setDraft((current) => ({ ...current, schedule_date: date }));
                      }}
                    />
                  </Label>
                  <Label>
                    分類
                    <select
                      value={draft.category}
                      disabled={!member}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, category: event.target.value }))
                      }
                      className="mt-2 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      {scheduleCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </Label>
                </div>
                <Label>
                  概要
                  <Textarea
                    value={draft.description}
                    placeholder="この日に何をするか"
                    disabled={!member}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Label>
                    活動時間
                    <Input
                      value={draft.activity_time}
                      placeholder="例: 16:30-18:00"
                      disabled={!member}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          activity_time: event.target.value,
                        }))
                      }
                    />
                  </Label>
                  <Label>
                    活動場所
                    <Input
                      value={draft.location}
                      placeholder="例: 部室 / 3号館"
                      disabled={!member}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, location: event.target.value }))
                      }
                    />
                  </Label>
                </div>
                <Label>
                  メモ
                  <Textarea
                    value={draft.memo}
                    placeholder="準備物、宿題、確認事項など"
                    disabled={!member}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, memo: event.target.value }))
                    }
                  />
                </Label>
                <Label>
                  議事録
                  <Textarea
                    value={draft.minutes}
                    placeholder="活動後に、決まったことや次回までの宿題を書く"
                    disabled={!member}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, minutes: event.target.value }))
                    }
                  />
                </Label>
                <Label>
                  写真・共有フォルダURL
                  <Textarea
                    value={draft.photo_urls}
                    placeholder="Google Drive / OneDrive / Teams のURLを1行ずつ"
                    disabled={!member}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, photo_urls: event.target.value }))
                    }
                  />
                </Label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!member || isSaving} onClick={saveSchedule}>
                  {selectedScheduleId ? "保存" : "追加"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!member}
                  onClick={() => setDraft(emptyDraft(selectedDate))}
                >
                  入力をクリア
                </Button>
                {selectedScheduleId && (
                  <Button type="button" variant="destructive" onClick={deleteSchedule}>
                    <Trash2 />
                    削除
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
