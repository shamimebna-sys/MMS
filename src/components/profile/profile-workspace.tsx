"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Eye, EyeOff, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { changePasswordAction, updateProfileAction } from "@/app/(workspace)/profile/actions";
import { Portrait } from "@/components/media/portrait";
import { Button } from "@/components/ui/button";
import { passwordChangeSchema, PROFILE_IMAGE_MAX_BYTES, profileUpdateSchema, type ProfileActionResult, type ProfileViewModel } from "@/features/profile/schema";

const idle: ProfileActionResult = { ok: false, error: "" };

function Notice({ state }: { state: ProfileActionResult }) {
  if (state.ok) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        {state.message}
      </p>
    );
  }
  if (!state.error) return null;
  return (
    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
      {state.error}
    </p>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="bg-card px-5 py-3.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</dt>
      <dd className="mt-1 break-words text-[13.5px]">{value}</dd>
    </div>
  );
}

function passwordHint(value: string): string {
  if (!value) return "Use at least 12 characters.";
  if (value.length < 12) return `${12 - value.length} more character${12 - value.length === 1 ? "" : "s"} needed.`;
  return "Length meets the account rule.";
}

export function ProfileWorkspace({ profile }: { profile: ProfileViewModel }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [profileState, setProfileState] = useState<ProfileActionResult>(idle);
  const [profilePending, setProfilePending] = useState(false);
  const [profileSaved, setProfileSaved] = useState("");
  const [passwordState, setPasswordState] = useState<ProfileActionResult>(idle);
  const [passwordPending, setPasswordPending] = useState(false);
  const [showPassword, setShowPassword] = useState({ current: false, next: false, confirm: false });
  const [nextPassword, setNextPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoPending, setPhotoPending] = useState(false);
  const [passwordClientError, setPasswordClientError] = useState("");
  const form = useForm({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: profile.name, email: profile.email },
  });

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function openEditor(next: boolean) {
    setOpen(next);
    if (next) {
      setProfileState(idle);
      form.reset({ name: profile.name, email: profile.email });
    }
  }

  async function submitProfile(data: FormData) {
    setProfilePending(true);
    const result = await updateProfileAction(data);
    setProfileState(result);
    setProfilePending(false);
    if (result.ok) {
      setProfileSaved(result.message);
      setOpen(false);
      router.refresh();
    } else {
      setProfileSaved("");
    }
  }

  async function submitPassword(formElement: HTMLFormElement, data: FormData) {
    setPasswordPending(true);
    const result = await changePasswordAction(data);
    setPasswordState(result);
    setPasswordPending(false);
    if (result.ok) {
      formElement.reset();
      setPasswordClientError("");
      setNextPassword("");
      setShowPassword({ current: false, next: false, confirm: false });
      router.refresh();
    }
  }

  function clearSelection() {
    setFile(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (next.size > PROFILE_IMAGE_MAX_BYTES) {
      setPhotoError("Image must be between 1 byte and 5 MB.");
      setPhotoMessage("");
      event.target.value = "";
      return;
    }
    if (next.type && !["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setPhotoError("Upload a JPEG, PNG, or WebP image.");
      setPhotoMessage("");
      event.target.value = "";
      return;
    }
    setPhotoError("");
    setPhotoMessage("");
    setFile(next);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(next);
    });
  }

  async function submitPhoto(remove: boolean) {
    setPhotoPending(true);
    setPhotoError("");
    setPhotoMessage("");
    try {
      const body = new FormData();
      body.set("userId", String(profile.id));
      if (remove) body.set("remove", "1");
      else if (file) body.set("file", file);
      const response = await fetch("/api/profile/photo", { method: "POST", body });
      const data = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        setPhotoError(data?.error || "Could not update the profile photo.");
        return;
      }
      clearSelection();
      setPhotoMessage(data?.message || (remove ? "Profile photo removed." : "Profile photo updated."));
      router.refresh();
    } catch {
      setPhotoError("Could not update the profile photo.");
    } finally {
      setPhotoPending(false);
    }
  }

  const affiliation = [
    ["Agent", profile.agent],
    ["Agent mobile", profile.agentMobile],
    ["Agent balance", profile.agentBalance],
    ["Sub agent", profile.subAgent],
    ["Sub agent balance", profile.subAgentBalance],
  ].filter((field) => field[1]);

  return (
    <div className="space-y-5">
      {profileSaved ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {profileSaved}
        </p>
      ) : null}
      <section className="surface p-5 md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="grid h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border">
            {preview ? (
              <span
                role="img"
                aria-label="Selected profile photo preview"
                className="h-20 w-20 bg-cover bg-center"
                style={{ backgroundImage: `url("${preview}")` }}
              />
            ) : (
              <Portrait path={profile.avatar} name={profile.name || "User"} className="h-20 w-20 text-lg" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.25rem] font-semibold tracking-tight">{profile.name || "Unnamed account"}</h2>
            <p className="mt-1 truncate text-[13.5px] text-muted">{profile.email}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px]">
              {profile.role ? <span className="text-foreground">{profile.role}</span> : null}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  profile.status === "Active"
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-background text-muted"
                }`}
              >
                {profile.status || "Unknown"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => openEditor(true)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit Profile
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="h-3.5 w-3.5" />
              Change Photo
            </Button>
          </div>
        </div>

        <div id="profile-photo" className="mt-5 border-t border-border pt-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold">Profile photo</h3>
              <p className="mt-1 text-[13px] leading-5 text-muted">JPEG, PNG, or WebP. Maximum 5 MB. The new photo replaces the current one after it is saved.</p>
              <label className="mt-3 grid gap-1.5 text-[12.5px] font-medium">
                Choose an image
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="control h-auto py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-background file:px-2 file:py-1 file:text-[12px] file:font-semibold"
                  onChange={onFile}
                />
              </label>
              {file ? <p className="mt-2 text-[12.5px] text-muted">Preview ready: {file.name}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {file ? (
                <Button type="button" variant="outline" onClick={clearSelection} disabled={photoPending}>
                  Cancel
                </Button>
              ) : null}
              <Button type="button" onClick={() => submitPhoto(false)} disabled={!file || photoPending}>
                {photoPending && file ? "Saving…" : "Save photo"}
              </Button>
              {profile.avatar ? (
                <Dialog.Root>
                  <Dialog.Trigger asChild>
                    <Button type="button" variant="outline" disabled={photoPending}>
                      Remove photo
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="erp-overlay" />
                    <Dialog.Content className="erp-modal">
                      <div className="erp-modal-header">
                        <div>
                          <Dialog.Title className="erp-modal-title">Remove profile photo?</Dialog.Title>
                          <Dialog.Description className="erp-modal-copy">
                            Your account will show initials until you upload another photo.
                          </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                          <button type="button" aria-label="Close" className="erp-modal-close">
                            <X className="h-4 w-4" />
                          </button>
                        </Dialog.Close>
                      </div>
                      <div className="erp-modal-footer">
                        <Dialog.Close asChild>
                          <Button type="button" variant="outline">
                            Cancel
                          </Button>
                        </Dialog.Close>
                        <Dialog.Close asChild>
                          <Button type="button" variant="destructive" onClick={() => submitPhoto(true)}>
                            Remove
                          </Button>
                        </Dialog.Close>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              ) : null}
            </div>
          </div>
          {photoError ? <p className="mt-3 text-[13px] text-red-600">{photoError}</p> : null}
          {photoMessage ? <p className="mt-3 text-[13px] text-emerald-700 dark:text-emerald-300">{photoMessage}</p> : null}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="surface overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold">Personal information</h2>
          </div>
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            <InfoItem label="Full name" value={profile.name} />
            <InfoItem label="Email" value={profile.email} />
            <InfoItem label="Phone" value={profile.phone} />
            <InfoItem label="Designation" value={profile.designation} />
            <InfoItem label="Role" value={profile.role} />
            <InfoItem label="Account status" value={profile.status} />
            <InfoItem label="Email verification" value={profile.emailVerified ? "Verified" : "Not verified"} />
          </dl>
        </section>

        <section className="surface p-5 md:p-6">
          <h2 className="text-[15px] font-semibold">Account security</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Use at least 12 characters. After a change, every other signed-in session is signed out and this session stays active.
          </p>
            <form
            className="mt-4 grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const parsed = passwordChangeSchema.safeParse({
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
                confirmPassword: data.get("confirmPassword"),
              });
              if (!parsed.success) {
                setPasswordClientError(parsed.error.issues[0]?.message ?? "Check the password fields.");
                return;
              }
              setPasswordClientError("");
              void submitPassword(form, data);
            }}
          >
            <input type="hidden" name="userId" value={profile.id} />
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              visible={showPassword.current}
              onToggle={() => setShowPassword((current) => ({ ...current, current: !current.current }))}
            />
            <PasswordField
              label="New password"
              name="newPassword"
              autoComplete="new-password"
              visible={showPassword.next}
              onToggle={() => setShowPassword((current) => ({ ...current, next: !current.next }))}
              onValue={setNextPassword}
              hint={passwordHint(nextPassword)}
            />
            <PasswordField
              label="Confirm new password"
              name="confirmPassword"
              autoComplete="new-password"
              visible={showPassword.confirm}
              onToggle={() => setShowPassword((current) => ({ ...current, confirm: !current.confirm }))}
            />
            <div>
              <Button type="submit" disabled={passwordPending}>
                {passwordPending ? "Updating…" : "Change password"}
              </Button>
            </div>
          </form>
          {passwordClientError ? <p className="mt-4 text-[13px] text-red-600">{passwordClientError}</p> : null}
          <div className="mt-4">
            <Notice state={passwordState} />
          </div>
        </section>
      </div>

      {affiliation.length ? (
        <section className="surface overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[15px] font-semibold">Affiliation</h2>
          </div>
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            {affiliation.map(([label, value]) => (
              <InfoItem key={label} label={label} value={value} />
            ))}
          </dl>
        </section>
      ) : null}

      <Dialog.Root open={open} onOpenChange={openEditor}>
        <Dialog.Portal>
          <Dialog.Overlay className="form-modal-overlay" />
          <Dialog.Content
            className="form-modal-backdrop"
            onClick={(event) => {
              if (event.target === event.currentTarget) openEditor(false);
            }}
          >
            <div className="form-modal form-modal-compact">
              <header className="form-modal-header">
                <div className="min-w-0">
                  <Dialog.Title className="form-modal-title">Edit profile</Dialog.Title>
                  <Dialog.Description className="form-modal-copy">
                    Update your name and sign-in email. Role, status, and permissions stay with the office.
                  </Dialog.Description>
                </div>
                <Dialog.Close type="button" className="form-modal-close" aria-label="Close">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </header>
              <form
                className="form-modal-form"
                onSubmit={form.handleSubmit((values) => {
                  const data = new FormData();
                  data.set("name", values.name);
                  data.set("email", values.email);
                  data.set("userId", String(profile.id));
                  void submitProfile(data);
                })}
              >
                <div className="form-modal-body">
                  <section className="record-section">
                    <h2 className="record-section-title">Account</h2>
                    <p className="record-section-copy">Name and the email address used to sign in.</p>
                    <div className="grid gap-4">
                      <label className="record-label">
                        Full name
                        <input className="control mt-1.5" autoComplete="name" {...form.register("name")} />
                        {form.formState.errors.name ? <span className="mt-1 block font-normal text-red-600">{form.formState.errors.name.message}</span> : null}
                      </label>
                      <label className="record-label">
                        Email
                        <input className="control mt-1.5" type="email" autoComplete="email" {...form.register("email")} />
                        {form.formState.errors.email ? <span className="mt-1 block font-normal text-red-600">{form.formState.errors.email.message}</span> : null}
                        <span className="record-hint">
                          Changing the email updates the address you use to sign in. The new address is marked unverified. This application does not send a confirmation message.
                        </span>
                      </label>
                    </div>
                  </section>
                  {!profileState.ok && profileState.error ? <p className="record-alert mt-4">{profileState.error}</p> : null}
                </div>
                <div className="form-modal-footer">
                  <Dialog.Close type="button" className="listing-btn">
                    Cancel
                  </Dialog.Close>
                  <button type="submit" className="record-save" disabled={profilePending}>
                    {profilePending ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function PasswordField({
  label,
  name,
  autoComplete,
  visible,
  onToggle,
  onValue,
  hint,
}: {
  label: string;
  name: string;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
  onValue?: (value: string) => void;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-[12.5px] font-medium">
      {label}
      <span className="relative block">
        <input
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={name === "currentPassword" ? 1 : 12}
          maxLength={200}
          className="control pr-11"
          onChange={onValue ? (event) => onValue(event.target.value) : undefined}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-foreground"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={onToggle}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {hint ? <span className="font-normal text-muted">{hint}</span> : null}
    </label>
  );
}
