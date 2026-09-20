import { redirect } from "next/navigation";

/**
 * Retired. This route used to be a mock screen that imitated a feature the app
 * does not have. Gmail is never connected. Outreach opens a draft in the user's own Gmail instead.
 */
export default function RetiredPage() {
  redirect("/profile");
}
