import { describe, expect, it } from "vitest";
import { loginDestination } from "@/lib/candidate-access";
import { staffDeskGate, workspaceGate } from "@/lib/role-landing";

describe("company and employer login landings", () => {
  it("sends Company to its landing from the public home and from the staff desk", () => {
    expect(loginDestination({ roleName: "Company", candidateId: null, requested: "/" })).toEqual({ href: "/company" });
    expect(loginDestination({ roleName: "Company", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/company" });
    expect(loginDestination({ roleName: "Company", candidateId: null, requested: "/records/candidates" })).toEqual({
      href: "/company",
    });
  });

  it("sends Employer to its landing from the public home and from the staff desk", () => {
    expect(loginDestination({ roleName: "Employer", candidateId: null, requested: "/" })).toEqual({ href: "/employer" });
    expect(loginDestination({ roleName: "Employer", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/employer" });
    expect(loginDestination({ roleName: "Employer", candidateId: null, requested: "/wallet" })).toEqual({ href: "/employer" });
  });

  it("lets each role open its own landing page", () => {
    expect(workspaceGate({ roleName: "Company", candidateId: null, pathname: "/company" })).toEqual({ action: "shell" });
    expect(workspaceGate({ roleName: "Employer", candidateId: null, pathname: "/employer" })).toEqual({ action: "shell" });
  });

  it("refuses every other role on those landings", () => {
    expect(workspaceGate({ roleName: "Agent", candidateId: null, pathname: "/company" })).toEqual({
      action: "redirect",
      href: "/dashboard",
    });
    expect(workspaceGate({ roleName: "admin", candidateId: null, pathname: "/employer" })).toEqual({
      action: "redirect",
      href: "/dashboard",
    });
    expect(workspaceGate({ roleName: "sadmin", candidateId: null, pathname: "/company" })).toEqual({
      action: "redirect",
      href: "/dashboard",
    });
    expect(workspaceGate({ roleName: "Employee", candidateId: null, pathname: "/employer" })).toEqual({
      action: "redirect",
      href: "/dashboard",
    });
    expect(workspaceGate({ roleName: "Company", candidateId: null, pathname: "/employer" })).toEqual({
      action: "redirect",
      href: "/company",
    });
    expect(workspaceGate({ roleName: "Employer", candidateId: null, pathname: "/company" })).toEqual({
      action: "redirect",
      href: "/employer",
    });
    expect(workspaceGate({ roleName: "Candidate", candidateId: 45, pathname: "/company" })).toEqual({
      action: "redirect",
      href: "/candidate",
    });
    expect(workspaceGate({ roleName: "Candidate", candidateId: null, pathname: "/employer" })).toEqual({
      action: "restricted",
    });
    expect(loginDestination({ roleName: "Agent", candidateId: null, requested: "/company" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "owner", candidateId: null, requested: "/employer" })).toEqual({ href: "/dashboard" });
  });
});

describe("existing role redirects", () => {
  it("keeps the staff desk and the candidate file on their current paths", () => {
    expect(loginDestination({ roleName: "admin", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "Agent", candidateId: null, requested: "/records/candidates" })).toEqual({
      href: "/records/candidates",
    });
    expect(loginDestination({ roleName: "Employee", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "sadmin", candidateId: null, requested: "/candidate" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "Candidate", candidateId: 45, requested: "/dashboard" })).toEqual({ href: "/candidate" });
    expect(loginDestination({ roleName: "Candidate", candidateId: null, requested: "/candidate" })).toEqual({ href: "/dashboard" });
    expect(loginDestination({ roleName: "Candidate", candidateId: null, requested: "/dashboard" })).toEqual({ href: "/dashboard" });
    expect(staffDeskGate("Agent", null)).toEqual({ action: "shell" });
    expect(staffDeskGate("admin", null)).toEqual({ action: "shell" });
    expect(staffDeskGate("Employee", null)).toEqual({ action: "shell" });
    expect(staffDeskGate("Candidate", 45)).toEqual({ action: "redirect", href: "/candidate" });
    expect(staffDeskGate("Candidate", null)).toEqual({ action: "restricted" });
    expect(staffDeskGate("Company", null)).toEqual({ action: "redirect", href: "/company" });
    expect(staffDeskGate("Employer", null)).toEqual({ action: "redirect", href: "/employer" });
  });
});
