// SPDX-License-Identifier: GPL-3.0-or-later
// Sign-in: the password form, then, if the server asks for one, the second-factor step for its
// `kind`. After sign-in the app goes to a fixed route, or back to the route held in memory when the
// session ended (UI-3). Between Session.login and Session.verify nothing else is sent (A10).
import type {
  SessionAuthenticated,
  SessionLoginReply,
} from "@omv-webui/react-api-omv/generated";
import { useNavigate } from "@tanstack/react-router";
import { useSession, useSessionStore } from "../../session/sessionContext.ts";
import { landingAfterSignIn } from "../../session/sessionStore.ts";
import { SignInForm } from "../organisms/SignInForm.tsx";
import { TotpForm } from "../organisms/TotpForm.tsx";
import { UnsupportedChallenge } from "../organisms/UnsupportedChallenge.tsx";
import { SignInTemplate } from "../templates/SignInTemplate.tsx";

export function SignInPage() {
  const session = useSession();
  const store = useSessionStore();
  const navigate = useNavigate();

  const signedIn = (reply: SessionAuthenticated) => {
    const landing = landingAfterSignIn(store.getState());
    store.dispatch({
      type: "signedIn",
      username: reply.username,
      role: reply.permissions.role,
    });
    void navigate({ href: landing, replace: true });
  };

  const onReply = (reply: SessionLoginReply) => {
    if (reply.status === "authenticated") {
      signedIn(reply);
    } else {
      store.dispatch({
        type: "challenged",
        username: reply.username,
        kind: reply.challenge.kind,
      });
    }
  };

  const abandon = () => store.dispatch({ type: "challengeAbandoned" });

  let content;
  if (session.status === "challenge") {
    content =
      session.kind === "totp" ? (
        <TotpForm
          username={session.username}
          onAuthenticated={signedIn}
          onExpired={() => store.dispatch({ type: "challengeExpired" })}
          onCancel={abandon}
        />
      ) : (
        <UnsupportedChallenge onCancel={abandon} />
      );
  } else {
    content = (
      <SignInForm
        notice={session.status === "signedOut" ? session.notice : null}
        onReply={onReply}
      />
    );
  }
  return <SignInTemplate>{content}</SignInTemplate>;
}
