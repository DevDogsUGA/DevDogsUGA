import * as Toast from "@radix-ui/react-toast";
import { type Icon, type IconWeight } from "@phosphor-icons/react";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react/ssr";

interface Props {
  icon?: Icon;
  iconWeight?: IconWeight;
  message: string;
}

export function Error({
  icon: Icon = XCircleIcon,
  iconWeight,
  message,
}: Props) {
  return (
    <div className="flex w-full items-center justify-center gap-5 rounded-lg border-2 border-red-800 bg-red-200 px-6 py-4 text-black shadow-lg">
      <Icon weight={iconWeight} className="text-3xl text-red-800" />
      <Toast.Description className="flex-1 text-lg leading-tight">
        {message}
      </Toast.Description>
    </div>
  );
}

export function Warning({
  icon: Icon = WarningIcon,
  iconWeight,
  message,
}: Props) {
  return (
    <div className="flex w-full items-center justify-center gap-5 rounded-lg border-2 border-amber-800 bg-amber-200 px-6 py-4 text-black shadow-lg">
      <Icon weight={iconWeight} className="text-3xl text-amber-800" />
      <Toast.Description className="flex-1 text-lg leading-tight">
        {message}
      </Toast.Description>
    </div>
  );
}

export function Info({ icon: Icon = InfoIcon, iconWeight, message }: Props) {
  return (
    <div className="flex w-full items-center justify-center gap-5 rounded-lg border-2 border-sky-800 bg-sky-200 px-6 py-4 text-black shadow-lg">
      <Icon weight={iconWeight} className="text-3xl text-sky-800" />
      <Toast.Description className="flex-1 text-lg leading-tight">
        {message}
      </Toast.Description>
    </div>
  );
}

export function Success({
  icon: Icon = CheckCircleIcon,
  iconWeight,
  message,
}: Props) {
  return (
    <div className="flex w-full items-center justify-center gap-5 rounded-lg border-2 border-emerald-800 bg-emerald-200 px-6 py-4 text-black shadow-lg">
      <Icon weight={iconWeight} className="text-3xl text-emerald-800" />
      <Toast.Description className="flex-1 text-lg leading-tight">
        {message}
      </Toast.Description>
    </div>
  );
}
