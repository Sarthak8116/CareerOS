import { redirect } from "next/navigation";

/**
 * Retired. This route used to be a mock screen that imitated a feature the app
 * does not have. There are no accounts: everything is stored in this browser.
 */
export default function RetiredPage() {
  redirect("/dashboard");
}
