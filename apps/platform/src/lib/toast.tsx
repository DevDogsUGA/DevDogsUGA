import { toast as sonnerToast } from "sonner";
import Toast from "~/ui/toast";

export const toast = {
  success: (message: string) =>
    sonnerToast.custom((id) => (
      <Toast id={id} message={message} type="success" />
    )),
  error: (message: string) =>
    sonnerToast.custom((id) => (
      <Toast id={id} message={message} type="error" />
    )),
  dismiss: sonnerToast.dismiss,
};
