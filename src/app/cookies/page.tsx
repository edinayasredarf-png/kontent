import { permanentRedirect } from "next/navigation";

export default function CookiePolicy() {
  permanentRedirect("/legal/cookies");
}
