"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { changePasswordAction } from "@/app/(workspace)/profile/actions";
import { updateCandidateProfileAction } from "@/app/(portal)/candidate/(home)/profile/actions";
import { passwordChangeSchema, profilePhotoSelectionError, type ProfileActionResult } from "@/features/profile/schema";
import {
  CANDIDATE_FIELDS_AWAITING_APPROVAL,
  parseCandidateSelfEdit,
  type CandidateSelfEditDetails,
  type CandidateSelfEditField,
} from "@/lib/candidate-self-edit";
import { mediaUrl } from "@/lib/media";
import type { PortalFact } from "@/server/candidate-portal";
import styles from "./profile-editor.module.css";

const idle: ProfileActionResult = { ok: false, error: "" };

const EDITABLE_LABELS = new Set([
  "Secondary email",
  "Mobile",
  "Secondary mobile",
  "Emergency mobile",
  "NID",
  "BID",
  "Date of birth",
  "Gender",
  "Blood group",
  "Nationality",
  "Father",
  "Mother",
  "Marital status",
  "Height",
  "Weight",
]);
const ADDRESS_LABELS = ["Present address", "Permanent address"];
const PASSPORT_LABELS = ["Passport", "Passport issued", "Passport expires"];
const WIDE_LABELS = new Set(["Present address", "Permanent address"]);

function Notice({ state }: { state: ProfileActionResult }) {
  if (state.ok) return <p className={`record-success ${styles.banner}`}>{state.message}</p>;
  if (!state.error) return null;
  return <p className={`record-alert ${styles.banner}`}>{state.error}</p>;
}

function takeFacts(facts: PortalFact[], labels: readonly string[]) {
  const byLabel = new Map(facts.map((fact) => [fact.label, fact]));
  const picked = labels.flatMap((label) => {
    const fact = byLabel.get(label);
    return fact ? [fact] : [];
  });
  const used = new Set<string>(labels);
  return { picked, rest: facts.filter((fact) => !used.has(fact.label)) };
}

function fieldErrorFor(message: string, field?: CandidateSelfEditField): Partial<Record<CandidateSelfEditField, string>> {
  if (field) return { [field]: message };
  if (message === "That email is already in use.") return { email: message };
  return {};
}

function Section({ title, copy, children }: { title: string; copy?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {copy ? <p className={styles.sectionCopy}>{copy}</p> : null}
      {children}
    </section>
  );
}

function EditableField({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LockedField({ id, label, value, hint, wide }: { id: string; label: string; value: string; hint: string; wide?: boolean }) {
  return (
    <div className={wide ? styles.wide : undefined}>
      <div className={styles.label} id={`${id}-label`}>
        {label}
      </div>
      <div className={styles.locked} id={id} aria-labelledby={`${id}-label`} aria-readonly="true">
        {value}
      </div>
      <p className={styles.hint} id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  );
}

function LockedFields({ facts }: { facts: PortalFact[] }) {
  if (!facts.length) return null;
  return (
    <div className={styles.grid}>
      {facts.map((fact) => (
        <LockedField key={fact.label} id={`locked-${fact.label}`} label={fact.label} value={fact.value} hint="Cannot be changed here." wide={WIDE_LABELS.has(fact.label)} />
      ))}
    </div>
  );
}

const CONTACT_FIELDS: Array<{ name: keyof CandidateSelfEditDetails; label: string; type: string; maxLength: number; autoComplete?: string }> = [
  { name: "secondaryEmail", label: "Secondary email", type: "email", maxLength: 250, autoComplete: "email" },
  { name: "mobile", label: "Mobile", type: "tel", maxLength: 250, autoComplete: "tel" },
  { name: "secondaryMobile", label: "Secondary mobile", type: "tel", maxLength: 250, autoComplete: "tel" },
  { name: "emergencyMobile", label: "Emergency mobile", type: "tel", maxLength: 250, autoComplete: "tel" },
];

const PERSONAL_FIELDS: Array<{ name: keyof CandidateSelfEditDetails; label: string; type: string; maxLength: number }> = [
  { name: "nid", label: "NID", type: "text", maxLength: 250 },
  { name: "bid", label: "BID", type: "text", maxLength: 250 },
  { name: "dob", label: "Date of birth", type: "date", maxLength: 10 },
  { name: "gender", label: "Gender", type: "text", maxLength: 20 },
  { name: "bloodGroup", label: "Blood group", type: "text", maxLength: 20 },
  { name: "nationality", label: "Nationality", type: "text", maxLength: 250 },
  { name: "fatherName", label: "Father", type: "text", maxLength: 250 },
  { name: "motherName", label: "Mother", type: "text", maxLength: 250 },
  { name: "maritalStatus", label: "Marital status", type: "text", maxLength: 100 },
  { name: "height", label: "Height", type: "text", maxLength: 100 },
  { name: "weight", label: "Weight", type: "text", maxLength: 100 },
];

export function CandidateProfileEditor({
  userId,
  name,
  email,
  details,
  code,
  status,
  avatar,
  photoRef,
  locked,
}: {
  userId: number;
  name: string;
  email: string;
  details: CandidateSelfEditDetails;
  code: string;
  status: string;
  avatar: string;
  photoRef: string;
  locked: PortalFact[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  const [profileState, setProfileState] = useState<ProfileActionResult>(idle);
  const [profilePending, setProfilePending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CandidateSelfEditField, string>>>({});
  const [passwordState, setPasswordState] = useState<ProfileActionResult>(idle);
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [savedAvatar, setSavedAvatar] = useState(avatar);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [photoBroken, setPhotoBroken] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoMessage, setPhotoMessage] = useState("");

  useEffect(() => {
    setSavedAvatar(avatar);
  }, [avatar]);

  const stored = locked.filter((fact) => !EDITABLE_LABELS.has(fact.label));
  const address = takeFacts(stored, ADDRESS_LABELS);
  const passport = takeFacts(address.rest, PASSPORT_LABELS);
  const other = passport.rest;
  const shownSrc = preview || (photoBroken ? "" : mediaUrl(savedAvatar));
  const initial = name.trim().slice(0, 1).toUpperCase() || "C";
  const lockedSections = [
    { title: "Address information", facts: address.picked },
    { title: "Passport information", facts: passport.picked },
    { title: "Other information", facts: other },
  ].filter((section) => section.facts.length > 0);

  function clearSelection() {
    previewRequest.current += 1;
    setFile(null);
    setPreview("");
    setPhotoError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    const error = profilePhotoSelectionError(next);
    if (error) {
      previewRequest.current += 1;
      setPhotoError(error);
      setPhotoMessage("");
      event.target.value = "";
      return;
    }
    const requestId = ++previewRequest.current;
    const reader = new FileReader();
    reader.onload = () => {
      if (requestId !== previewRequest.current) return;
      setPhotoError("");
      setPhotoMessage("");
      setFile(next);
      setPreview(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      if (requestId !== previewRequest.current) return;
      setPhotoError("Could not preview that image.");
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsDataURL(next);
  }

  async function uploadSelectedPhoto(selected: File): Promise<{ ok: true; avatar: string; message: string } | { ok: false; error: string }> {
    try {
      const body = new FormData();
      body.set("userId", String(userId));
      body.set("file", selected);
      const response = await fetch("/api/profile/photo", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; avatar?: string } | null;
      if (!response.ok) return { ok: false, error: payload?.error || "Could not update the profile photo." };
      return {
        ok: true,
        avatar: payload?.avatar || savedAvatar,
        message: payload?.message || "Profile photo updated.",
      };
    } catch {
      return { ok: false, error: "Could not update the profile photo." };
    }
  }

  async function submitProfile(form: HTMLFormElement) {
    const data = new FormData(form);
    const payload: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (typeof value !== "string") {
        setPhotoError("Documents cannot be changed from the candidate portal.");
        return;
      }
      payload[key] = value;
    }
    const parsed = parseCandidateSelfEdit(payload);
    if (!parsed.ok) {
      setFieldErrors(fieldErrorFor(parsed.error, parsed.field));
      setProfileState(parsed.field ? idle : { ok: false, error: parsed.error });
      if (parsed.field) document.getElementById(`candidate-${parsed.field}`)?.focus();
      return;
    }
    if (file) {
      const selectionError = profilePhotoSelectionError(file);
      if (selectionError) {
        setPhotoError(selectionError);
        return;
      }
    }

    setFieldErrors({});
    setProfilePending(true);
    setPhotoError("");
    let photoSaved = "";
    try {
      if (file) {
        const uploaded = await uploadSelectedPhoto(file);
        if (!uploaded.ok) {
          setPhotoError(uploaded.error);
          return;
        }
        photoSaved = uploaded.message;
        setPhotoBroken(false);
        setSavedAvatar(uploaded.avatar);
        clearSelection();
      }

      const result = await updateCandidateProfileAction(data);
      if (result.ok) {
        setPhotoMessage("");
        setProfileState({ ok: true, message: photoSaved ? `${result.message} ${photoSaved}` : result.message });
        router.refresh();
      } else {
        setProfileState(result);
        setFieldErrors(fieldErrorFor(result.error));
        if (photoSaved) {
          setPhotoMessage(photoSaved);
          router.refresh();
        }
      }
    } finally {
      setProfilePending(false);
    }
  }

  async function submitPassword(formData: FormData) {
    setPasswordPending(true);
    const result = await changePasswordAction(formData);
    setPasswordState(result);
    setPasswordPending(false);
  }

  return (
    <div className={styles.page}>
      <header className={`surface ${styles.header}`}>
        <div className={styles.identity}>
          <div className={styles.frame}>
            {shownSrc ? (
              <img
                src={shownSrc}
                alt={preview ? "Selected profile photo preview" : `${name || "Candidate"} profile photo`}
                className={styles.photo}
                onError={() => {
                  if (!preview) setPhotoBroken(true);
                }}
              />
            ) : (
              <div className={styles.fallback} aria-hidden="true">
                {initial}
              </div>
            )}
            {preview ? <span className={styles.flag}>Preview</span> : null}
          </div>
          <div className={styles.who}>
            <p className={styles.kicker}>Edit profile</p>
            <h1 className={styles.name}>{name || "Candidate"}</h1>
            <div className={styles.meta}>
              <span className={styles.code}>{code || "No candidate code"}</span>
              <span className="listing-badge listing-badge-neutral">{status}</span>
            </div>
          </div>
        </div>
        <Link href="/candidate" className={`btn-quiet no-underline ${styles.back}`}>
          Back
        </Link>
        <div className={styles.photoBar}>
          <div className={styles.photoActions}>
            <button type="button" className="btn-quiet" onClick={() => fileRef.current?.click()} disabled={profilePending}>
              Change Photo
            </button>
            {file ? (
              <button type="button" className="btn-quiet" onClick={clearSelection} disabled={profilePending}>
                Cancel Selection
              </button>
            ) : null}
          </div>
          <p className={styles.note}>JPEG, PNG, or WebP. Maximum 5 MB. A selected photo is kept when you save changes.</p>
          {file ? <p className={styles.fileName}>Preview ready: {file.name}</p> : null}
          {photoError ? (
            <p className={styles.photoAlert} role="alert">
              {photoError}
            </p>
          ) : null}
          {photoMessage ? <p className={styles.photoOk}>{photoMessage}</p> : null}
        </div>
        <input
          ref={fileRef}
          id="candidate-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          aria-label="Choose a profile photo"
          onChange={onFile}
        />
      </header>

      <form
        className={`surface ${styles.panel}`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitProfile(event.currentTarget);
        }}
      >
        <Section title="Profile information" copy="Name and email update your candidate file and the email you use to sign in.">
          <div className={`${styles.grid} ${styles.pair}`}>
            <EditableField id="candidate-name" label="Name" required error={fieldErrors.name}>
              <input
                id="candidate-name"
                name="name"
                defaultValue={name}
                required
                maxLength={100}
                className={fieldErrors.name ? `control ${styles.invalid}` : "control"}
                autoComplete="name"
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? "candidate-name-error" : undefined}
                onChange={() => setFieldErrors((current) => ({ ...current, name: undefined }))}
              />
            </EditableField>
            <EditableField id="candidate-email" label="Email" required error={fieldErrors.email}>
              <input
                id="candidate-email"
                name="email"
                type="email"
                defaultValue={email}
                required
                maxLength={250}
                className={fieldErrors.email ? `control ${styles.invalid}` : "control"}
                autoComplete="email"
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? "candidate-email-error" : undefined}
                onChange={() => setFieldErrors((current) => ({ ...current, email: undefined }))}
              />
            </EditableField>
            <LockedField id="candidate-code" label="Candidate code" value={code || "Not stored"} hint="System-controlled. Cannot be changed." />
            <LockedField id="candidate-status" label="Recruitment status" value={status} hint="System-controlled. Cannot be changed." />
          </div>
        </Section>

        <Section title="Contact information" copy="Phone numbers and the secondary email are saved on your candidate file.">
          <div className={styles.grid}>
            {CONTACT_FIELDS.map((field) => {
              const error = fieldErrors[field.name];
              return (
                <EditableField key={field.name} id={`candidate-${field.name}`} label={field.label} error={error}>
                  <input
                    id={`candidate-${field.name}`}
                    name={field.name}
                    type={field.type}
                    defaultValue={details[field.name]}
                    maxLength={field.maxLength}
                    autoComplete={field.autoComplete}
                    className={error ? `control ${styles.invalid}` : "control"}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `candidate-${field.name}-error` : undefined}
                    onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: undefined }))}
                  />
                </EditableField>
              );
            })}
          </div>
        </Section>

        <Section title="Personal information" copy="These details are saved on your candidate file.">
          <div className={styles.grid}>
            {PERSONAL_FIELDS.map((field) => {
              const error = fieldErrors[field.name];
              return (
                <EditableField key={field.name} id={`candidate-${field.name}`} label={field.label} error={error}>
                  <input
                    id={`candidate-${field.name}`}
                    name={field.name}
                    type={field.type}
                    defaultValue={details[field.name]}
                    maxLength={field.maxLength}
                    className={error ? `control ${styles.invalid}` : "control"}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `candidate-${field.name}-error` : undefined}
                    onChange={() => setFieldErrors((current) => ({ ...current, [field.name]: undefined }))}
                  />
                </EditableField>
              );
            })}
          </div>
        </Section>

        <Section title="Recruitment photograph">
          <div className={styles.recruit}>
            {photoRef ? (
              <img src={`/candidate/file?ref=${encodeURIComponent(photoRef)}`} alt="Recruitment photograph" className={styles.recruitPhoto} />
            ) : null}
            <p className={styles.recruitCopy}>
              {photoRef
                ? "The recruitment photograph is stored on the recruitment file and cannot be changed through this portal."
                : "No photograph is stored yet. The recruitment photograph cannot be changed through this portal."}
            </p>
          </div>
        </Section>

        {lockedSections.map((section) => (
          <Section key={section.title} title={section.title}>
            <LockedFields facts={section.facts} />
          </Section>
        ))}

        <section className={styles.section}>
          <details>
            <summary className={styles.summary}>Personal fields waiting for an edit rule</summary>
            <p className={styles.sectionCopy}>These are stored when present, and this portal will not save them until a candidate edit rule is approved.</p>
            <ul className={styles.waiting}>
              {CANDIDATE_FIELDS_AWAITING_APPROVAL.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </details>
        </section>

        <Notice state={profileState} />
        <div className={styles.footer}>
          <Link href="/candidate" className="btn-quiet no-underline">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={profilePending}>
            {profilePending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>

      <form
        className={`surface ${styles.panel}`}
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
            setPasswordError(parsed.error.issues[0]?.message ?? "Check the password fields.");
            return;
          }
          setPasswordError("");
          void submitPassword(data);
        }}
      >
        <Section title="Password" copy="Password changes use the existing account rule. Use at least 12 characters. Other sessions are signed out.">
          <input type="hidden" name="userId" value={userId} />
          <div className={styles.grid}>
            <EditableField id="current-password" label="Current password">
              <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" className="control" />
            </EditableField>
            <EditableField id="new-password" label="New password">
              <input id="new-password" name="newPassword" type="password" autoComplete="new-password" className="control" />
            </EditableField>
            <EditableField id="confirm-password" label="Confirm new password">
              <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" className="control" />
            </EditableField>
          </div>
        </Section>
        {passwordError ? <p className="record-alert">{passwordError}</p> : null}
        <Notice state={passwordState} />
        <div className={styles.footer}>
          <button type="submit" className="btn-primary" disabled={passwordPending}>
            {passwordPending ? "Updating…" : "Change password"}
          </button>
        </div>
      </form>
    </div>
  );
}
