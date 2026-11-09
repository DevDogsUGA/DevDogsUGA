import { toast as sonnerToast } from "sonner";
import Toast from "~/ui/toast";

/**
 * The Cosmic toast, with every type. The site's own `~/lib/toast` is the
 * pre-Cosmic one during the rollback; the hidden kit page keeps showing the
 * Cosmic toasts through this, and Cosmic's return points `~/lib/toast` back.
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
  warning: (message: string) =>
    sonnerToast.custom((id) => (
      <Toast id={id} message={message} type="warning" />
    )),
  info: (message: string) =>
    sonnerToast.custom((id) => <Toast id={id} message={message} type="info" />),
  dismiss: sonnerToast.dismiss,
};
