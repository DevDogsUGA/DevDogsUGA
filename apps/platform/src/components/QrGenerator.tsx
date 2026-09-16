"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Icon, IconWeight } from "@phosphor-icons/react";
import * as PhosphorIcons from "@phosphor-icons/react/ssr";
import {
  DownloadSimpleIcon,
  ImageSquareIcon,
  ImagesSquareIcon,
  ProhibitIcon,
  ShapesIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import JSZip from "jszip";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import Select from "~/components/Select";
import { ConsoleCard } from "~/ui/card";
import { ComboboxPopover } from "~/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";
import Field from "~/ui/field";
import {
  ERROR_LEVELS,
  QR_DEFAULTS,
  QR_FORMATS,
  contrastingBackground,
  qrVersionIssue,
  renderQrSvg,
  type ErrorLevel,
  type QrFormat,
  type QrShape,
} from "~/lib/qr";

const DISCORD_LOGO_PATHS = {
  "discord-white": "/brand/discord-white.svg",
  "discord-black": "/brand/discord-black.svg",
  "discord-blurple": "/brand/discord-blurple.svg",
} as const;
type DiscordLogoChoice = keyof typeof DISCORD_LOGO_PATHS;
type LogoChoice =
  "devdogs" | "acm" | DiscordLogoChoice | "icon" | "custom" | "none";
type Brand = "devdogs" | "acm";
type Theme = `${Brand}-${"light" | "dark"}` | "custom";
const ACM_LOGO_CROP = {
  x: 0,
  y: 24,
  width: 265,
  height: 265,
  sourceWidth: 384,
  sourceHeight: 533,
};
const ICON_WEIGHTS: IconWeight[] = [
  "thin",
  "light",
  "regular",
  "bold",
  "fill",
  "duotone",
];
function isDiscordLogoChoice(value: string): value is DiscordLogoChoice {
  return value in DISCORD_LOGO_PATHS;
}

function iconLabel(name: string) {
  return name
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

const PHOSPHOR_ICON_ENTRIES = Object.entries(PhosphorIcons)
  .filter(([name]) => name.endsWith("Icon"))
  .map(([name, component]) => ({
    name,
    label: iconLabel(name),
    component: component as Icon,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));
const PHOSPHOR_ICON_COMPONENTS = Object.fromEntries(
  PHOSPHOR_ICON_ENTRIES.map(({ name, component }) => [name, component]),
) as Record<string, Icon>;
const PHOSPHOR_ICON_GROUPS = (() => {
  const groups = new Map<string, typeof PHOSPHOR_ICON_ENTRIES>();
  for (const icon of PHOSPHOR_ICON_ENTRIES) {
    const group = icon.label[0] ?? "Other";
    groups.set(group, [...(groups.get(group) ?? []), icon]);
  }
  return Array.from(groups, ([label, icons]) => ({
    label,
    options: icons.map(({ name, label: iconName }) => ({
      value: name,
      label: iconName,
    })),
  }));
})();
const MIME: Record<Exclude<QrFormat, "svg" | "tiff">, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
  detail?: string;
}

interface ComboboxGroup {
  label?: string;
  options: ComboboxOption[];
}

function matchingComboboxGroups(
  groups: ComboboxGroup[],
  query: string,
  maxVisible?: number,
): ComboboxGroup[] {
  const matching = groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) =>
          !query ||
          option.label.toLowerCase().includes(query) ||
          option.detail?.toLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.options.length);
  if (maxVisible === undefined) return matching;

  const limited: ComboboxGroup[] = [];
  let count = 0;
  for (const group of matching) {
    const options = group.options.slice(0, maxVisible - count);
    if (options.length) limited.push({ ...group, options });
    count += options.length;
    if (count >= maxVisible) break;
  }
  return limited;
}

function nextEnabledIndex(
  options: readonly {
    disabled?: boolean;
    label?: string;
    value?: string;
  }[],
  current: number,
  direction: 1 | -1,
): number {
  if (!options.length) return -1;
  if (current < 0) {
    const indices = Array.from({ length: options.length }, (_, index) =>
      direction === 1 ? index : options.length - index - 1,
    );
    return indices.find((index) => !options[index]?.disabled) ?? -1;
  }
  for (let offset = 1; offset <= options.length; offset++) {
    const index =
      (((current + direction * offset) % options.length) + options.length) %
      options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

function fileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The image could not be read as a data URL."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function encodeTiff(image: ImageData): Blob {
  const entries = 13;
  const ifd = 8;
  const extras = ifd + 2 + entries * 12 + 4;
  const bits = extras;
  const xres = bits + 8;
  const yres = xres + 8;
  const pixels = yres + 8;
  const buffer = new ArrayBuffer(pixels + image.data.length);
  const view = new DataView(buffer);
  view.setUint16(0, 0x4949);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd, true);
  view.setUint16(ifd, entries, true);
  const tags: [number, number, number, number][] = [
    [256, 4, 1, image.width],
    [257, 4, 1, image.height],
    [258, 3, 4, bits],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, pixels],
    [277, 3, 1, 4],
    [278, 4, 1, image.height],
    [279, 4, 1, image.data.length],
    [282, 5, 1, xres],
    [283, 5, 1, yres],
    [284, 3, 1, 1],
    [338, 3, 1, 2],
  ];
  tags.forEach(([tag, type, count, value], i) => {
    const at = ifd + 2 + i * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    view.setUint32(at + 8, value, true);
  });
  view.setUint32(ifd + 2 + entries * 12, 0, true);
  [0, 2, 4, 6].forEach((offset) => view.setUint16(bits + offset, 8, true));
  view.setUint32(xres, 72, true);
  view.setUint32(xres + 4, 1, true);
  view.setUint32(yres, 72, true);
  view.setUint32(yres + 4, 1, true);
  new Uint8Array(buffer, pixels).set(image.data);
  return new Blob([buffer], { type: "image/tiff" });
}

async function rasterize(
  svg: string,
  size: number,
  format: Exclude<QrFormat, "svg">,
  foreground: string,
  background?: string,
): Promise<Blob> {
  const source = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
  try {
    const image = document.createElement("img");
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d", {
      willReadFrequently: format === "tiff",
    });
    if (!context)
      throw new Error("This browser cannot create an image canvas.");
    if (format === "jpg" && !background) {
      context.fillStyle = contrastingBackground(foreground);
      context.fillRect(0, 0, size, size);
    }
    context.drawImage(image, 0, 0, size, size);
    if (format === "tiff")
      return encodeTiff(context.getImageData(0, 0, size, size));
    const mime = MIME[format];
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, format === "jpg" ? 0.92 : undefined),
    );
    if (blob?.type !== mime)
      throw new Error(
        `${format.toUpperCase()} export is not supported by this browser.`,
      );
    return blob;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function QrGenerator() {
  const [text, setText] = useState("https://devdogsuga.org/attendance");
  const [filename, setFilename] = useState("qr");
  const [size, setSize] = useState(QR_DEFAULTS.size);
  const [margin, setMargin] = useState(QR_DEFAULTS.margin);
  const [color, setColor] = useState(QR_DEFAULTS.color);
  const [background, setBackground] = useState("");
  const [theme, setTheme] = useState<Theme>("devdogs-light");
  const [shape, setShape] = useState<QrShape>(QR_DEFAULTS.shape);
  const [logoChoice, setLogoChoice] = useState<LogoChoice>("devdogs");
  const [devdogsLogo, setDevdogsLogo] = useState<string>();
  const [acmLogo, setAcmLogo] = useState<string>();
  const [discordLogos, setDiscordLogos] = useState<
    Partial<Record<DiscordLogoChoice, string>>
  >({});
  const [customLogo, setCustomLogo] = useState<string>();
  const [customLogoName, setCustomLogoName] = useState("Custom Graphic");
  const customLogoInputRef = useRef<HTMLInputElement>(null);
  const iconSvgRef = useRef<SVGSVGElement>(null);
  const [iconName, setIconName] = useState("LinkIcon");
  const [iconWeight, setIconWeight] = useState<IconWeight>("bold");
  const [iconColor, setIconColor] = useState("#ffffff");
  const [iconLogo, setIconLogo] = useState<string>();
  const [logoSize, setLogoSize] = useState(QR_DEFAULTS.logoSize);
  const [logoPadding, setLogoPadding] = useState(QR_DEFAULTS.logoPadding);
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>(
    QR_DEFAULTS.errorLevel,
  );
  const [version, setVersion] = useState<number | undefined>();
  const [formats, setFormats] = useState<Set<QrFormat>>(
    new Set(QR_DEFAULTS.formats),
  );
  const [avifSupported, setAvifSupported] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/brand/devdog.svg")
      .then((r) => r.blob())
      .then(fileDataUrl)
      .then(setDevdogsLogo)
      .catch(() => setStatus("The default logo could not be loaded."));
    fetch("/brand/acm-uga.png")
      .then((r) => r.blob())
      .then(fileDataUrl)
      .then(setAcmLogo)
      .catch(() => setStatus("The ACM logo could not be loaded."));
    for (const [variant, path] of Object.entries(DISCORD_LOGO_PATHS))
      fetch(path)
        .then((r) => r.blob())
        .then(fileDataUrl)
        .then((data) =>
          setDiscordLogos((current) => ({
            ...current,
            [variant]: data,
          })),
        )
        .catch(() => setStatus("The Discord logo could not be loaded."));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.toBlob(
      (blob) => setAvifSupported(blob?.type === "image/avif"),
      "image/avif",
    );
  }, []);
  const SelectedPhosphorIcon = PHOSPHOR_ICON_COMPONENTS[iconName] ?? ShapesIcon;
  useEffect(() => {
    if (logoChoice !== "icon" || !iconSvgRef.current) return;
    const svg = iconSvgRef.current.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "256");
    svg.setAttribute("height", "256");
    svg.removeAttribute("class");
    svg.removeAttribute("aria-hidden");
    setIconLogo(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        new XMLSerializer().serializeToString(svg),
      )}`,
    );
  }, [logoChoice, iconName, iconWeight, iconColor]);
  const logo =
    logoChoice === "devdogs"
      ? devdogsLogo
      : logoChoice === "acm"
        ? acmLogo
        : isDiscordLogoChoice(logoChoice)
          ? discordLogos[logoChoice]
          : logoChoice === "icon"
            ? iconLogo
            : logoChoice === "custom"
              ? customLogo
              : undefined;
  const result = useMemo(() => {
    try {
      return {
        svg: renderQrSvg(
          text,
          {
            size,
            margin,
            color,
            background: background || undefined,
            shape,
            logoCrop: logoChoice === "acm" ? ACM_LOGO_CROP : undefined,
            logoSize,
            logoPadding,
            errorLevel,
            version,
          },
          logo,
        ),
        error: "",
      };
    } catch (error) {
      return {
        svg: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [
    text,
    size,
    margin,
    color,
    background,
    shape,
    logoChoice,
    logoSize,
    logoPadding,
    errorLevel,
    version,
    logo,
  ]);
  const preview = result.svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`
    : "";
  const versionGroups = useMemo<ComboboxGroup[]>(() => {
    const hasLogo =
      logoChoice === "devdogs" ||
      logoChoice === "acm" ||
      isDiscordLogoChoice(logoChoice) ||
      (logoChoice === "icon" && !!iconLogo) ||
      (logoChoice === "custom" && !!customLogo);
    const option = (value: number | undefined): ComboboxOption => {
      const issue = qrVersionIssue(
        text,
        errorLevel,
        value,
        logoSize,
        logoPadding,
        hasLogo,
      );
      return {
        value: value === undefined ? "auto" : String(value),
        label: value === undefined ? "Auto" : `Version ${value}`,
        disabled: !!issue,
        detail: issue,
      };
    };
    return [
      { label: "Automatic", options: [option(undefined)] },
      {
        label: "Versions",
        options: Array.from({ length: 40 }, (_, index) => option(index + 1)),
      },
    ];
  }, [
    text,
    errorLevel,
    logoSize,
    logoPadding,
    logoChoice,
    customLogo,
    iconLogo,
  ]);

  const toggleFormat = (format: QrFormat) =>
    setFormats((old) => {
      if (format === "avif" && !avifSupported) return old;
      const next = new Set(old);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  async function download(): Promise<boolean> {
    if (result.error || !result.svg) {
      setStatus(result.error);
      return false;
    }
    if (!formats.size) {
      setStatus("Choose at least one format.");
      return false;
    }
    if (formats.has("avif") && !avifSupported) {
      setStatus("AVIF export is not supported by this browser.");
      return false;
    }
    if (
      (logoChoice === "devdogs" ||
        logoChoice === "acm" ||
        isDiscordLogoChoice(logoChoice)) &&
      !logo
    ) {
      setStatus("The selected logo is still loading.");
      return false;
    }
    if (logoChoice === "icon" && !logo) {
      setStatus("The selected icon is still rendering.");
      return false;
    }
    setStatus("Preparing downloads…");
    try {
      const baseName = filename.trim() || "qr";
      const files: { format: QrFormat; blob: Blob }[] = [];
      for (const format of formats) {
        const blob =
          format === "svg"
            ? new Blob([result.svg], { type: "image/svg+xml" })
            : await rasterize(
                result.svg,
                size,
                format,
                color,
                background || undefined,
              );
        files.push({ format, blob });
      }
      if (files.length === 1) {
        const file = files[0]!;
        save(file.blob, `${baseName}.${file.format}`);
      } else {
        const zip = new JSZip();
        for (const file of files)
          zip.file(`${baseName}.${file.format}`, file.blob);
        save(await zip.generateAsync({ type: "blob" }), `${baseName}.zip`);
      }
      setStatus(
        `${formats.size === 1 ? "File" : "ZIP archive"} downloaded. Scan before printing: a logo hides modules that error correction must recover.`,
      );
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  const number = (value: string) => Number(value);
  function openCustomLogoPicker() {
    const picker = customLogoInputRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  }
  function applyTheme(next: Theme) {
    setTheme(next);
    setStatus("");
    if (next === "custom") return;
    const separator = next.lastIndexOf("-");
    const nextBrand = next.slice(0, separator) as Brand;
    const colorTheme = next.slice(separator + 1) as "light" | "dark";
    setShape(nextBrand === "acm" ? "square" : "rounded");
    setColor(colorTheme === "dark" ? "#000000" : "#ffffff");
    setBackground("");
    setLogoChoice(nextBrand);
    setLogoSize(QR_DEFAULTS.logoSize);
    setLogoPadding(QR_DEFAULTS.logoPadding);
    setErrorLevel(QR_DEFAULTS.errorLevel);
    setVersion(undefined);
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ConsoleCard.Root>
        <ConsoleCard.Header
          title="Generator"
          description="Defaults reproduce the attendance-poster QR style."
        />
        <ConsoleCard.Content>
          <Field
            label="Content"
            htmlFor="qr-text"
            description="A URL, plain text, or any other value a QR scanner can open."
          >
            <div className="group focus-within:shadow-block-sm relative flex max-w-sm overflow-hidden rounded-sm border border-mauve-600 bg-mauve-900 text-sm transition-shadow hover:border-mauve-500">
              <textarea
                id="qr-text"
                className="form-textarea min-h-24 w-full resize-y border-0 bg-mauve-800 px-3 py-2 text-sm text-white group-hover:inset-shadow-sm placeholder:text-mauve-500 focus:ring-0 focus:inset-shadow-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
              />
            </div>
          </Field>
          <Field
            label="Theme"
            description="Themes combine a brand, module shape, center mark, and color treatment. Choose Custom to tune them manually."
          >
            <div
              role="radiogroup"
              aria-label="QR code theme"
              className="grid max-w-3xl gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              <OptionButton
                name="DevDogs Light"
                detail="Rounded, white, transparent"
                swatch="#ffffff"
                selected={theme === "devdogs-light"}
                onClick={() => applyTheme("devdogs-light")}
              />
              <OptionButton
                name="DevDogs Dark"
                detail="Rounded, black, transparent"
                swatch="#000000"
                selected={theme === "devdogs-dark"}
                onClick={() => applyTheme("devdogs-dark")}
              />
              <OptionButton
                name="ACM Light"
                detail="Square, white, transparent"
                swatch="#ffffff"
                selected={theme === "acm-light"}
                onClick={() => applyTheme("acm-light")}
              />
              <OptionButton
                name="ACM Dark"
                detail="Square, black, transparent"
                swatch="#000000"
                selected={theme === "acm-dark"}
                onClick={() => applyTheme("acm-dark")}
              />
              <OptionButton
                name="Custom"
                detail="Customize the current theme"
                swatch="linear-gradient(135deg, #ffffff 0 33%, #ba0c2f 33% 66%, #00a4ad 66%)"
                selected={theme === "custom"}
                onClick={() => applyTheme("custom")}
              />
            </div>
          </Field>
          {theme === "custom" && (
            <div className="max-w-3xl space-y-6 rounded-sm border border-mauve-700 bg-mauve-900/40 px-4 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Control label="Margin (modules)">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={margin}
                    onChange={(e) => setMargin(number(e.target.value))}
                  />
                </Control>
                <Control label="Module style">
                  <Select
                    className="w-full max-w-sm"
                    value={shape}
                    aria-label="QR module style"
                    onValueChange={(value) => setShape(value as QrShape)}
                  >
                    <Select.Item value="rounded">Rounded</Select.Item>
                    <Select.Item value="square">Square</Select.Item>
                  </Select>
                </Control>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorCombobox
                  label="Modules and eyes"
                  value={color}
                  set={setColor}
                  transparentValue="transparent"
                />
                <ColorCombobox
                  label="Background (optional)"
                  value={background}
                  set={setBackground}
                  transparentValue=""
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Control label="Error correction">
                  <Select
                    className="w-full max-w-sm"
                    value={errorLevel}
                    onValueChange={(value) =>
                      setErrorLevel(value as ErrorLevel)
                    }
                    aria-label="Error correction"
                  >
                    {ERROR_LEVELS.map((level) => (
                      <Select.Item key={level} value={level}>
                        {level}
                      </Select.Item>
                    ))}
                  </Select>
                </Control>
                <Control label="Version (auto or 1–40)">
                  <SingleCombobox
                    ariaLabel="QR version"
                    value={version === undefined ? "auto" : String(version)}
                    groups={versionGroups}
                    onValueChange={(value) =>
                      setVersion(value === "auto" ? undefined : Number(value))
                    }
                  />
                  <p className="mt-2 text-xs text-mauve-400">
                    Disabled versions cannot fit the content or the logo’s
                    covered area exceeds the selected correction level’s nominal
                    recovery budget.
                  </p>
                </Control>
              </div>
              <Field
                label="Logo"
                description="Choose a built-in mark, upload custom artwork, or omit the logo."
              >
                <Select
                  className="w-full max-w-sm"
                  aria-label="Center logo"
                  value={logoChoice}
                  onValueChange={(value) => {
                    if (value === "upload") openCustomLogoPicker();
                    else setLogoChoice(value as LogoChoice);
                  }}
                >
                  <Select.Item
                    value="devdogs"
                    icon={<LogoPreview kind="devdogs" />}
                  >
                    DevDogs Logo
                  </Select.Item>
                  <Select.Item value="acm" icon={<LogoPreview kind="acm" />}>
                    ACM Logo
                  </Select.Item>
                  <Select.Item
                    value="discord-white"
                    icon={<DiscordLogoPreview variant="discord-white" />}
                  >
                    Discord White
                  </Select.Item>
                  <Select.Item
                    value="discord-black"
                    icon={<DiscordLogoPreview variant="discord-black" />}
                  >
                    Discord Black
                  </Select.Item>
                  <Select.Item
                    value="discord-blurple"
                    icon={<DiscordLogoPreview variant="discord-blurple" />}
                  >
                    Discord Blurple
                  </Select.Item>
                  <Select.Item
                    value="icon"
                    icon={
                      <SelectedPhosphorIcon
                        className="size-6"
                        color={iconColor}
                        weight={iconWeight}
                      />
                    }
                  >
                    Icon
                  </Select.Item>
                  {customLogo && (
                    <Select.Item
                      value="custom"
                      icon={<LogoPreview kind="custom" src={customLogo} />}
                      description={customLogoName}
                    >
                      Custom Graphic
                    </Select.Item>
                  )}
                  <Select.Item
                    value="upload"
                    icon={<ImageSquareIcon className="size-6" />}
                  >
                    {customLogo ? "Replace Custom Graphic…" : "Custom Graphic…"}
                  </Select.Item>
                  <Select.Item
                    value="none"
                    icon={<ProhibitIcon className="size-6" />}
                  >
                    None
                  </Select.Item>
                </Select>
                <input
                  ref={customLogoInputRef}
                  type="file"
                  accept="image/*,.svg"
                  aria-label="Custom graphic file"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setCustomLogo(await fileDataUrl(file));
                    setCustomLogoName(file.name);
                    setLogoChoice("custom");
                    event.target.value = "";
                  }}
                />
              </Field>
              {logoChoice === "icon" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Control label="Icon">
                    <SingleCombobox
                      ariaLabel="Phosphor icon"
                      value={iconName}
                      groups={PHOSPHOR_ICON_GROUPS}
                      maxVisible={75}
                      onValueChange={setIconName}
                    />
                  </Control>
                  <Control label="Icon weight">
                    <Select
                      className="w-full max-w-sm"
                      value={iconWeight}
                      aria-label="Phosphor icon weight"
                      onValueChange={(value) =>
                        setIconWeight(value as IconWeight)
                      }
                    >
                      {ICON_WEIGHTS.map((weight) => (
                        <Select.Item key={weight} value={weight}>
                          {weight[0]!.toUpperCase() + weight.slice(1)}
                        </Select.Item>
                      ))}
                    </Select>
                  </Control>
                  <ColorCombobox
                    label="Icon color"
                    value={iconColor}
                    set={setIconColor}
                    transparentValue="transparent"
                  />
                  <SelectedPhosphorIcon
                    ref={iconSvgRef}
                    className="sr-only"
                    aria-hidden="true"
                    size={256}
                    color={iconColor}
                    weight={iconWeight}
                  />
                </div>
              )}
              {logoChoice !== "none" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Control label="Logo size (modules)">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={logoSize}
                      onChange={(e) => setLogoSize(number(e.target.value))}
                    />
                  </Control>
                  <Control label="Logo padding (modules)">
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={logoPadding}
                      onChange={(e) => setLogoPadding(number(e.target.value))}
                    />
                  </Control>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col items-end gap-2">
            <ExportDialog
              filename={filename}
              setFilename={setFilename}
              size={size}
              setSize={setSize}
              formats={formats}
              toggleFormat={toggleFormat}
              avifSupported={avifSupported}
              download={download}
              disabled={!!result.error}
            />
            {(result.error || status) && (
              <p
                role="status"
                className={`text-right ${
                  result.error
                    ? "text-sm text-rose-400"
                    : "text-sm text-mauve-300"
                }`}
              >
                {result.error || status}
              </p>
            )}
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
      <ConsoleCard.Root className="h-fit lg:sticky lg:top-20">
        <ConsoleCard.Header title="Preview" />
        <ConsoleCard.Content>
          <div
            className="flex aspect-square items-center justify-center overflow-hidden rounded-lg p-4"
            style={{
              background:
                "repeating-conic-gradient(#443d49 0 25%, #2e2933 0 50%) 0 0 / 10px 10px",
            }}
          >
            {preview ? (
              <Image
                src={preview}
                alt="Generated QR code preview"
                width={size || QR_DEFAULTS.size}
                height={size || QR_DEFAULTS.size}
                unoptimized
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-center text-sm text-rose-400">
                {result.error}
              </span>
            )}
          </div>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </div>
  );
}

function DiscordLogoPreview({ variant }: { variant: DiscordLogoChoice }) {
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-sm"
      style={{
        background:
          "repeating-conic-gradient(#443d49 0 25%, #2e2933 0 50%) 0 0 / 6px 6px",
      }}
    >
      <Image
        src={DISCORD_LOGO_PATHS[variant]}
        alt=""
        width={24}
        height={18}
        unoptimized
        className="h-auto w-5"
      />
    </span>
  );
}

function LogoPreview({
  kind,
  src,
}: {
  kind: "devdogs" | "acm" | "custom";
  src?: string;
}) {
  if (kind === "acm")
    return (
      <span
        className="size-6 shrink-0 bg-no-repeat"
        style={{
          backgroundImage: "url('/brand/acm-uga.png')",
          backgroundPosition: "0 -2.2px",
          backgroundSize: "34.8px 48.3px",
        }}
        aria-hidden
      />
    );
  return (
    <Image
      src={kind === "devdogs" ? "/brand/devdog.svg" : src!}
      alt=""
      width={24}
      height={24}
      unoptimized
      className="size-6 shrink-0 object-contain"
    />
  );
}

function SingleCombobox({
  ariaLabel,
  value,
  groups,
  maxVisible,
  onValueChange,
}: {
  ariaLabel: string;
  value: string;
  groups: ComboboxGroup[];
  maxVisible?: number;
  onValueChange: (value: string) => void;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = groups
    .flatMap((group) => group.options)
    .find((option) => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = matchingComboboxGroups(
    groups,
    normalizedQuery,
    maxVisible,
  );
  const visibleOptions = visibleGroups.flatMap((group) => group.options);
  const listboxId = `${uid}-listbox`;

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(option: ComboboxOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return (
    <ComboboxPopover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setActiveIndex(-1);
        }
      }}
    >
      <ComboboxPopover.Anchor asChild>
        <span className="group focus-within:shadow-block-sm relative flex max-w-sm items-center rounded-sm border border-mauve-600 bg-mauve-800 text-sm transition-shadow focus-within:inset-shadow-sm hover:border-mauve-500 hover:inset-shadow-sm">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && activeIndex >= 0
                ? `${uid}-option-${activeIndex}`
                : undefined
            }
            value={open ? query : (selected?.label ?? value)}
            className="form-input w-full border-0 bg-transparent px-3 text-sm text-white placeholder:text-mauve-500 focus:ring-0 focus:outline-none"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setQuery("");
              setActiveIndex(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) =>
                  nextEnabledIndex(
                    visibleOptions,
                    current,
                    event.key === "ArrowDown" ? 1 : -1,
                  ),
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const option =
                  visibleOptions[activeIndex] ??
                  visibleOptions.find((candidate) => !candidate.disabled);
                if (option) choose(option);
              }
              if (event.key === "Escape") setOpen(false);
            }}
          />
        </span>
      </ComboboxPopover.Anchor>
      <ComboboxPopover.Portal>
        <ComboboxPopover.Content
          className="data-[state=open]:shadow-block-sm z-60 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-sm border border-white/20 bg-mauve-900 transition-shadow data-[state=open]:delay-200"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
        >
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel}
          >
            {visibleGroups.length ? (
              visibleGroups.map((group, index) => (
                <div
                  key={group.label ?? index}
                  role="group"
                  aria-label={group.label}
                >
                  {group.label && (
                    <div className="sticky top-0 z-10 border-b border-mauve-700 bg-mauve-950 px-3 py-1.5 text-[0.65rem] font-bold tracking-wide text-mauve-400 uppercase">
                      {group.label}
                    </div>
                  )}
                  {group.options.map((option) => {
                    const index = visibleOptions.indexOf(option);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        id={`${uid}-option-${index}`}
                        aria-selected={option.value === value}
                        data-active={index === activeIndex ? true : undefined}
                        disabled={option.disabled}
                        title={option.detail}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white disabled:cursor-not-allowed disabled:text-mauve-600 disabled:hover:bg-transparent aria-selected:bg-mauve-800 aria-selected:text-white data-active:bg-mauve-700 data-active:text-white disabled:data-active:bg-transparent"
                        onMouseMove={() => setActiveIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(option);
                        }}
                      >
                        <span>{option.label}</span>
                        {option.detail && (
                          <span className="max-w-52 text-right text-xs text-mauve-500">
                            {option.detail}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-mauve-500">
                No matching options
              </p>
            )}
          </div>
        </ComboboxPopover.Content>
      </ComboboxPopover.Portal>
    </ComboboxPopover.Root>
  );
}

function ColorCombobox({
  label,
  value,
  set,
  transparentValue,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  transparentValue: string;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const groups = [
    {
      label: "General",
      options: [
        { label: "White", value: "#ffffff" },
        { label: "Black", value: "#000000" },
      ],
    },
    {
      label: "DevDogs",
      options: [
        { label: "DevDogs Red", value: "#cb0027" },
        { label: "DevDogs Cyan", value: "#00a4ad" },
        { label: "DevDogs Navy", value: "#32324b" },
      ],
    },
    {
      label: "ACM at UGA",
      options: [
        { label: "ACM Red", value: "#ba0c2f" },
        { label: "ACM Burgundy", value: "#480311" },
        { label: "ACM Gray", value: "#9ea2a2" },
      ],
    },
  ];
  const presetOptions = groups.flatMap((group) => group.options);
  const navigableOptions = [
    ...presetOptions,
    { label: "Transparent", value: transparentValue },
    { label: "Custom", value: "__custom__" },
  ];
  const normalized = value.trim().toLowerCase();
  const listboxId = `${uid}-colors`;

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(next: string) {
    set(next);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function openColorPicker() {
    setOpen(false);
    setActiveIndex(-1);
    const picker = colorPickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  }

  return (
    <Control label={label}>
      <ComboboxPopover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setActiveIndex(-1);
        }}
      >
        <ComboboxPopover.Anchor asChild>
          <span className="group focus-within:shadow-block-sm relative flex max-w-sm items-center rounded-sm border border-mauve-600 bg-mauve-800 text-sm transition-shadow focus-within:inset-shadow-sm hover:border-mauve-500 hover:inset-shadow-sm">
            <span
              className="ml-3 size-4 shrink-0 rounded-sm border border-white/20"
              style={{
                background:
                  value === transparentValue
                    ? "repeating-conic-gradient(#443d49 0 25%, #2e2933 0 50%) 0 0 / 8px 8px"
                    : value,
              }}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={label}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && activeIndex >= 0
                  ? `${uid}-color-${activeIndex}`
                  : undefined
              }
              value={value}
              placeholder="Transparent"
              className="form-input min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-white placeholder:text-mauve-500 focus:ring-0 focus:outline-none"
              onChange={(event) => {
                set(event.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                setActiveIndex(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpen(true);
                  setActiveIndex((current) =>
                    nextEnabledIndex(
                      navigableOptions,
                      current,
                      event.key === "ArrowDown" ? 1 : -1,
                    ),
                  );
                  return;
                }
                if (event.key === "Enter" && activeIndex >= 0) {
                  event.preventDefault();
                  const option = navigableOptions[activeIndex];
                  if (option?.value === "__custom__") openColorPicker();
                  else if (option) choose(option.value);
                }
                if (event.key === "Escape") setOpen(false);
              }}
            />
          </span>
        </ComboboxPopover.Anchor>
        <ComboboxPopover.Portal>
          <ComboboxPopover.Content
            className="data-[state=open]:shadow-block-sm z-60 max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-sm border border-white/20 bg-mauve-900 transition-shadow data-[state=open]:delay-200"
            sideOffset={4}
            align="start"
            onOpenAutoFocus={(event: Event) => event.preventDefault()}
          >
            <div
              ref={listRef}
              role="listbox"
              id={listboxId}
              aria-label={`${label} colors`}
            >
              {groups.map((group) => (
                <div key={group.label} role="group" aria-label={group.label}>
                  <div className="sticky top-0 z-10 border-b border-mauve-700 bg-mauve-950 px-3 py-1.5 text-[0.65rem] font-bold tracking-wide text-mauve-400 uppercase">
                    {group.label}
                  </div>
                  {group.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      id={`${uid}-color-${presetOptions.indexOf(option)}`}
                      aria-selected={normalized === option.value}
                      data-active={
                        presetOptions.indexOf(option) === activeIndex
                          ? true
                          : undefined
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white aria-selected:bg-mauve-800 aria-selected:text-white data-active:bg-mauve-700 data-active:text-white"
                      onMouseMove={() =>
                        setActiveIndex(presetOptions.indexOf(option))
                      }
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(option.value);
                      }}
                    >
                      <span
                        className="size-4 rounded-sm border border-white/20"
                        style={{ background: option.value }}
                        aria-hidden
                      />
                      {option.label}
                      <span className="ml-auto text-xs text-mauve-500">
                        {option.value}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              <div role="group" aria-label="Other">
                <div className="sticky top-0 z-10 border-b border-mauve-700 bg-mauve-950 px-3 py-1.5 text-[0.65rem] font-bold tracking-wide text-mauve-400 uppercase">
                  Other
                </div>
                <button
                  type="button"
                  role="option"
                  id={`${uid}-color-${presetOptions.length}`}
                  aria-selected={value === transparentValue}
                  data-active={
                    activeIndex === presetOptions.length ? true : undefined
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white aria-selected:bg-mauve-800 aria-selected:text-white data-active:bg-mauve-700 data-active:text-white"
                  onMouseMove={() => setActiveIndex(presetOptions.length)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(transparentValue);
                  }}
                >
                  <span className="size-4 rounded-sm border border-white/20 bg-[repeating-conic-gradient(#443d49_0_25%,#2e2933_0_50%)_0_0/8px_8px]" />
                  Transparent
                </button>
                <button
                  type="button"
                  role="option"
                  id={`${uid}-color-${presetOptions.length + 1}`}
                  aria-selected={false}
                  data-active={
                    activeIndex === presetOptions.length + 1 ? true : undefined
                  }
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white data-active:bg-mauve-700 data-active:text-white"
                  onMouseMove={() => setActiveIndex(presetOptions.length + 1)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openColorPicker();
                  }}
                >
                  Custom
                </button>
              </div>
            </div>
          </ComboboxPopover.Content>
        </ComboboxPopover.Portal>
      </ComboboxPopover.Root>
      <input
        ref={colorPickerRef}
        type="color"
        aria-label={`Choose a custom ${label.toLowerCase()} color`}
        className="sr-only"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(event) => set(event.target.value)}
      />
    </Control>
  );
}

function ExportDialog({
  filename,
  setFilename,
  size,
  setSize,
  formats,
  toggleFormat,
  avifSupported,
  download,
  disabled,
}: {
  filename: string;
  setFilename: (value: string) => void;
  size: number;
  setSize: (value: number) => void;
  formats: Set<QrFormat>;
  toggleFormat: (format: QrFormat) => void;
  avifSupported: boolean;
  download: () => Promise<boolean>;
  disabled: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <FormButton theme="black" type="button">
          <ImagesSquareIcon weight="bold" />
          Export
        </FormButton>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden rounded-xl border-2 border-mauve-800 bg-mauve-950 p-5 text-white shadow-2xl ring-0 shadow-black/60 sm:max-w-xl"
        overlayClassName="bg-black/40"
        onInteractOutside={(event) => {
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("[data-export-formats-popover]")
          )
            event.preventDefault();
        }}
      >
        <DialogHeader className="contents">
          <DialogTitle className="font-display flex items-center gap-[1ch] text-2xl leading-tight font-extrabold text-white">
            Export QR Code
            <ImagesSquareIcon className="text-mauve-400" weight="bold" />
          </DialogTitle>
          <DialogDescription className="text-sm text-mauve-300">
            Choose the output size and formats. Multiple formats are bundled
            into one ZIP archive.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-5 grid min-h-0 gap-4 overflow-y-auto px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Control label="File name">
              <Input
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
              />
            </Control>
            <Control label="Resolution (px)">
              <Input
                type="number"
                min={21}
                step={1}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              />
            </Control>
          </div>
          <Field
            label="Export Formats"
            description="SVG and PNG match the former CLI defaults."
          >
            <FormatCombobox
              formats={formats}
              toggleFormat={toggleFormat}
              avifSupported={avifSupported}
            />
            <p className="text-xs text-mauve-400">
              JPEG fills transparent backgrounds for contrast. TIFF is lossless
              RGBA.
            </p>
          </Field>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={disabled || exporting || formats.size === 0}
              className="flex items-center gap-1.5 rounded-lg border border-white bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-transparent hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={async () => {
                setExporting(true);
                const succeeded = await download();
                setExporting(false);
                if (succeeded) setOpen(false);
              }}
            >
              <DownloadSimpleIcon weight="bold" />
              {exporting ? "Downloading…" : "Download"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormatCombobox({
  formats,
  toggleFormat,
  avifSupported,
}: {
  formats: Set<QrFormat>;
  toggleFormat: (format: QrFormat) => void;
  avifSupported: boolean;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const options = QR_FORMATS.filter(
    (format) =>
      !formats.has(format) && format.includes(query.trim().toLowerCase()),
  );
  const navigationOptions = options.map((format) => ({
    disabled: format === "avif" && !avifSupported,
  }));
  const listboxId = `${uid}-formats`;

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function add(format: QrFormat) {
    if (format === "avif" && !avifSupported) return;
    toggleFormat(format);
    setQuery("");
    setOpen(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return (
    <ComboboxPopover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveIndex(-1);
      }}
    >
      <ComboboxPopover.Anchor asChild>
        <span className="group focus-within:shadow-block-sm relative flex max-w-sm cursor-text flex-wrap items-center gap-1 rounded-sm border border-mauve-600 bg-mauve-800 p-2 text-sm transition-shadow focus-within:inset-shadow-sm hover:border-mauve-500 hover:inset-shadow-sm">
          {[...formats].map((format) => (
            <span
              key={format}
              className="flex items-center gap-1.5 rounded-full border border-mauve-600 bg-mauve-800 py-0.5 pr-1.5 pl-2 text-sm text-white has-[button:hover]:border-rose-500 has-[button:hover]:bg-rose-500/10 has-[button:hover]:text-rose-300"
            >
              {format.toUpperCase()}
              <button
                type="button"
                onClick={() => toggleFormat(format)}
                className="shrink-0 rounded-sm text-mauve-400 hover:text-rose-400"
                aria-label={`Remove ${format.toUpperCase()}`}
              >
                <XIcon />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={
              open && activeIndex >= 0
                ? `${uid}-format-${activeIndex}`
                : undefined
            }
            value={query}
            placeholder={formats.size ? "Add format…" : "Choose formats…"}
            className="min-w-28 flex-1 border-0 bg-transparent p-0 px-1 text-sm text-white placeholder:text-mauve-500 focus:ring-0 focus:outline-none"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) =>
                  nextEnabledIndex(
                    navigationOptions,
                    current,
                    event.key === "ArrowDown" ? 1 : -1,
                  ),
                );
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const option =
                  options[activeIndex] ??
                  options.find((format) => format !== "avif" || avifSupported);
                if (option) add(option);
              }
              if (event.key === "Escape") setOpen(false);
              if (event.key === "Backspace" && !query && formats.size) {
                const last = [...formats].at(-1);
                if (last) toggleFormat(last);
              }
            }}
          />
        </span>
      </ComboboxPopover.Anchor>
      <ComboboxPopover.Portal>
        <ComboboxPopover.Content
          data-export-formats-popover
          className="data-[state=open]:shadow-block-sm pointer-events-auto z-60 w-(--radix-popover-trigger-width) rounded-sm border border-white/20 bg-mauve-900 transition-shadow data-[state=open]:delay-200"
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(event: Event) => event.preventDefault()}
        >
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label="Export formats"
            className="flex max-h-72 flex-col overflow-y-auto py-1"
          >
            {options.length ? (
              options.map((format, index) => {
                const disabled = format === "avif" && !avifSupported;
                return (
                  <button
                    key={format}
                    type="button"
                    role="option"
                    id={`${uid}-format-${index}`}
                    aria-selected={false}
                    data-active={index === activeIndex ? true : undefined}
                    disabled={disabled}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-mauve-200 transition-colors hover:bg-mauve-700 hover:text-white disabled:cursor-not-allowed disabled:text-mauve-600 disabled:hover:bg-transparent data-active:bg-mauve-700 data-active:text-white disabled:data-active:bg-transparent"
                    onMouseMove={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      add(format);
                    }}
                  >
                    {format.toUpperCase()}
                    {disabled && <span className="text-xs">Not supported</span>}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm text-mauve-500">
                No matching formats
              </p>
            )}
          </div>
        </ComboboxPopover.Content>
      </ComboboxPopover.Portal>
    </ComboboxPopover.Root>
  );
}

function OptionButton({
  name,
  detail,
  swatch,
  selected,
  onClick,
}: {
  name: string;
  detail: string;
  swatch: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="flex items-center gap-3 rounded-sm border border-mauve-600 bg-mauve-800 p-3 text-left transition hover:border-mauve-400 hover:inset-shadow-sm aria-checked:border-rose-400 aria-checked:ring-1 aria-checked:ring-rose-400"
      onClick={onClick}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-white/20"
        style={{
          background:
            "repeating-conic-gradient(#443d49 0 25%, #2e2933 0 50%) 0 0 / 10px 10px",
        }}
        aria-hidden="true"
      >
        <span
          className="size-4 rounded-[3px] border border-black/15"
          style={{ background: swatch }}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-white">{name}</span>
        <span className="text-xs text-mauve-400">{detail}</span>
      </span>
    </button>
  );
}

function Control({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return <Field label={label}>{children}</Field>;
}
