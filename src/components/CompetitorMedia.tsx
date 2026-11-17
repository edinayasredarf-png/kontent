"use client";

import { useState } from "react";
import { Globe, Send, Users } from "lucide-react";
import type { CKind } from "@/lib/competitors";
import { RoundIcon } from "./ui/PostCard";

const ICON = { telegram: Send, vk: Users, site: Globe };

export function CompetitorAvatar({ avatar, kind }: { avatar?: string | null; kind: CKind }) {
  const [failed, setFailed] = useState("");
  const Icon = ICON[kind] ?? Users;
  if (avatar && avatar !== failed && /^data:image\/(?:png|webp|jpeg);base64,/i.test(avatar)) {
    return <img src={avatar} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover" onError={() => setFailed(avatar)} />;
  }
  return <RoundIcon><Icon size={16} /></RoundIcon>;
}

export function CompetitorPhotos({ platform, post, count }: { platform: string; post: string; count: number }) {
  const [failed, setFailed] = useState<number[]>([]);
  const photos = Array.from({ length: Math.min(6, count) }, (_, index) => index).filter(index => !failed.includes(index));
  if (!photos.length) return null;
  return <div className={`mt-3 grid gap-2 ${photos.length > 1 ? "sm:grid-cols-2" : ""}`}>
    {photos.map(index => {
      const url = `/api/competitor-media/${platform}?${new URLSearchParams({ post, index: String(index) })}`;
      return <a key={index} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-surface">
        <img src={url} alt={`Изображение публикации ${index + 1}`} loading="lazy" decoding="async" className="max-h-96 w-full object-contain" onError={() => setFailed(old => [...old, index])} />
      </a>;
    })}
  </div>;
}
