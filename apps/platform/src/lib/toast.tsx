import { toast as sonnerToast } from "sonner";
import Toast from "~/classic/ui/toast";

/**
 * The site's toasts, in the pre-Cosmic look while the rollback is in place.
 * The Cosmic toast (with its warning and info types) is `~/ui/cosmic-toast`.
 */
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
