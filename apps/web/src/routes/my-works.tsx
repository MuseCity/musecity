import { redirect } from "react-router";
export function loader() {
  return redirect("/me/content?kind=work");
}
export default function LegacyWorks() {
  return null;
}
