// SPDX-License-Identifier: GPL-3.0-or-later
// Signing in, through the whole app on MSW serving the contract's examples: both roles, a wrong
// password, too many attempts, the one-time-code step (and the silence it needs between login and
// verify), a second factor of another kind, the session ending, signing out, and what is left in
// form state and browser storage afterwards (UI-3, UI-6, UI-9, UI-13, UI-14).
import { MOCK_TRACE } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clearStorage, storageSnapshot } from "../../stores/storageSnapshot.ts";
import {
  THEME_STORAGE_KEY,
  useThemeStore,
} from "../../stores/useThemeStore.ts";
import { WELCOME_STORAGE_KEY } from "../../stores/useWelcomeStore.ts";
import { findDashboard } from "../../test/dashboard.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const BOOT = ["System.getInformation", "UserMgmt.getUserByContext"];

async function signIn(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  username = "example-admin",
  password = "correct horse",
) {
  await user.type(await screen.findByLabelText("User name"), username);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("loading the app", () => {
  it("shows only sign-in without a session, whatever the address", async () => {
    await renderApp({ path: "/" });
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/ui/sign-in");
    expect(callNames()).toEqual(BOOT);
    // The 401 of the first read is the answer, not news: no "session ended" notice.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("goes straight in with a session, learning the role from the server", async () => {
    await renderApp({ signedIn: true, scenario: "user" });
    expect(
      await screen.findByText(
        "You are signed in as example-user, with user rights.",
      ),
    ).toBeInTheDocument();
  });
});

describe("signing in with a password", () => {
  it("signs an administrator in and lands on the start page", async () => {
    const { user } = await renderApp();
    await signIn(user);
    expect(await findDashboard()).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Account: example-admin" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/ui/");
    const login = seenCalls.find((c) => c.call === "Session.login");
    expect(login?.params).toEqual({
      username: "example-admin",
      password: "correct horse",
    });
  });

  it("signs a normal user in", async () => {
    const { user } = await renderApp({ scenario: "user" });
    await signIn(user, "example-user");
    expect(
      await screen.findByText(
        "You are signed in as example-user, with user rights.",
      ),
    ).toBeInTheDocument();
  });

  it("gives the fields the autocomplete values password managers need", async () => {
    await renderApp();
    expect(await screen.findByLabelText("User name")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("allows pasting the password", async () => {
    const { user } = await renderApp();
    await user.type(await screen.findByLabelText("User name"), "example-admin");
    await user.click(screen.getByLabelText("Password"));
    await user.paste("pasted secret");
    expect(screen.getByLabelText("Password")).toHaveValue("pasted secret");
  });

  it("says which field is empty and sends nothing", async () => {
    const { user } = await renderApp();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter your user name.")).toBeInTheDocument();
    expect(screen.getByLabelText("User name")).toHaveFocus();
    expect(callNames()).toEqual(BOOT);
  });

  it("shows the backend's message for a wrong password, once per attempt, and never its trace", async () => {
    const { user } = await renderApp({ scenario: "wrongPassword" });
    await signIn(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-in failed");
    expect(alert).toHaveTextContent(
      "Check the user name and password, then try again.",
    );
    expect(alert).toHaveTextContent(
      "Message from the serverIncorrect username or password.",
    );
    expect(document.body.textContent).not.toContain(MOCK_TRACE);
    expect(callNames().filter((c) => c === "Session.login")).toHaveLength(1);
    expect(screen.getByLabelText("Password")).toHaveFocus();
    // The account-lock explanation (M9) waits for a second failure.
    expect(
      screen.queryByText("Check the password before trying again"),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Password"), "another try");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("Check the password before trying again"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask another administrator/)).toBeInTheDocument();
    expect(callNames().filter((c) => c === "Session.login")).toHaveLength(2);
  });

  it("says to wait after too many attempts, and does not try again by itself (UI-14)", async () => {
    const { user } = await renderApp({ scenario: "tooManyAttempts" });
    await signIn(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Too many attempts");
    expect(alert).toHaveTextContent("Wait a few minutes, then try again.");
    expect(alert).toHaveTextContent(
      "Too many failed verification attempts. Please try again later.",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callNames().filter((c) => c === "Session.login")).toHaveLength(1);
  });

  it("renders backend text as text (UI-2)", async () => {
    const { user } = await renderApp({
      answers: {
        sessionLogin: {
          status: 400,
          message: '<img src=x onerror="alert(1)">Incorrect.',
        },
      },
    });
    await signIn(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent('<img src=x onerror="alert(1)">Incorrect.');
    expect(alert.querySelector("img")).toBeNull();
  });
});

describe("the one-time code (totp)", () => {
  it("sends nothing between login and verify, then signs in (A10)", async () => {
    const { user } = await renderApp({ scenario: "secondFactor" });
    await signIn(user, "example-2fa");
    const code = await screen.findByLabelText("6-digit code");
    expect(code).toHaveFocus();
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByText(/set up for example-2fa/)).toBeInTheDocument();
    // Time passes on the code screen; still nothing is sent.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callNames()).toEqual([...BOOT, "Session.login"]);

    await user.click(code);
    await user.paste("123 456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(
      await screen.findByText(
        "You are signed in as example-2fa, with user rights.",
      ),
    ).toBeInTheDocument();
    const login = callNames().indexOf("Session.login");
    expect(callNames()[login + 1]).toBe("Session.verify");
    expect(seenCalls.find((c) => c.call === "Session.verify")?.params).toEqual({
      code: "123456",
    });
  });

  it("refuses a code that is not six digits without sending it", async () => {
    const { user } = await renderApp({ scenario: "secondFactor" });
    await signIn(user, "example-2fa");
    await user.type(await screen.findByLabelText("6-digit code"), "12345");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(
      screen.getByText("Enter the 6 digits your authenticator app shows."),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("Session.verify");
  });

  it("shows a wrong code, clears it, and lets the user try again", async () => {
    const { user } = await renderApp({
      scenario: "secondFactor",
      answers: { sessionVerify: "wrongCode" },
    });
    await signIn(user, "example-2fa");
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Code not accepted");
    expect(alert).toHaveTextContent("Challenge verification failed.");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
    expect(screen.getByLabelText("6-digit code")).toHaveFocus();
  });

  it("says to wait after too many wrong codes", async () => {
    const { user } = await renderApp({
      scenario: "secondFactor",
      answers: { sessionVerify: "tooManyAttempts" },
    });
    await signIn(user, "example-2fa");
    await user.type(await screen.findByLabelText("6-digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many wrong codes",
    );
    expect(callNames().filter((c) => c === "Session.verify")).toHaveLength(1);
  });

  it("goes back to sign-in, plainly, when the pending login is gone (401)", async () => {
    const { user } = await renderApp({
      scenario: "secondFactor",
      answers: { sessionVerify: "noPendingLogin" },
    });
    await signIn(user, "example-2fa");
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The code step took too long or was interrupted",
    );
  });

  it("leaves the code step for the password form without a call", async () => {
    const { user } = await renderApp({ scenario: "secondFactor" });
    await signIn(user, "example-2fa");
    await user.click(
      await screen.findByRole("button", { name: "Use a different account" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(callNames()).toEqual([...BOOT, "Session.login"]);
  });
});

describe("a second factor of another kind", () => {
  it("points to the classic interface at a fixed address, and sends nothing more (UI-3)", async () => {
    const { user } = await renderApp({ scenario: "secondFactorOtherKind" });
    await signIn(user, "example-2fa");
    expect(
      await screen.findByRole("heading", {
        name: "Finish signing in with the classic interface",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Finish signing in with the classic interface",
      }),
    ).toHaveFocus();
    const link = screen.getByRole("link", {
      name: "Open the classic interface (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
    expect(callNames()).toEqual([...BOOT, "Session.login"]);
  });
});

describe("the session ending", () => {
  it("shows sign-in with a notice, and comes back to the same place after signing in", async () => {
    const { user, mock } = await renderApp({
      scenario: "sessionExpired",
      signedIn: true,
    });
    // The boot reads succeeded; the idle setting read that follows finds the session gone.
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session ended, so you were signed out.",
    );
    expect(mock.signedIn).toBe(false);
    await signIn(user);
    expect(await findDashboard()).toBeInTheDocument();
    expect(window.location.pathname).toBe("/ui/");
  });
});

describe("signing out", () => {
  it("ends the session on the server, forgets everything and shows sign-in", async () => {
    const { user, app } = await renderApp({ signedIn: true });
    await user.click(
      await screen.findByRole("button", { name: "Account: example-user" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You have signed out.",
    );
    expect(callNames()).toContain("Session.logout");
    expect(app.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(app.session.getState()).toMatchObject({ status: "signedOut" });
  });
});

describe("secrets after submit (UI-6, UI-13)", () => {
  it("keeps no password or code in form state, the query client or browser storage", async () => {
    useThemeStore.getState().setPreference("dark");
    const { user, app } = await renderApp({ scenario: "secondFactor" });
    await signIn(user, "example-2fa", "correct horse");
    const code = await screen.findByLabelText("6-digit code");
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await findDashboard();

    await waitFor(() =>
      expect(app.queryClient.getMutationCache().getAll()).toHaveLength(0),
    );
    const everything = JSON.stringify([
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
      app.session.getState(),
      storageSnapshot(),
      window.location.href,
    ]);
    expect(everything).not.toContain("correct horse");
    expect(everything).not.toContain("123456");
    expect(everything).not.toContain("EXAMPLE-SESSION-ID");
    // Storage holds the theme preference and the dashboard's first-visit flag (one boolean), and
    // nothing else: no user name, no server data.
    const { local, session } = storageSnapshot();
    expect(Object.keys(local).sort()).toEqual(
      [THEME_STORAGE_KEY, WELCOME_STORAGE_KEY].sort(),
    );
    expect(JSON.parse(local[WELCOME_STORAGE_KEY] ?? "")).toEqual({
      state: { seen: true },
      version: 1,
    });
    expect(JSON.parse(local[THEME_STORAGE_KEY] ?? "")).toEqual({
      state: { preference: "dark" },
      version: 1,
    });
    expect(session).toEqual({});
    useThemeStore.getState().setPreference("system");
    clearStorage();
  });

  it("empties the password field as soon as it is sent", async () => {
    const { user } = await renderApp({ scenario: "wrongPassword" });
    await signIn(user, "example-admin", "correct horse");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("User name")).toHaveValue("example-admin");
    const form = screen.getByRole("form", { name: "Sign in" });
    expect(within(form).queryByDisplayValue("correct horse")).toBeNull();
  });
});
