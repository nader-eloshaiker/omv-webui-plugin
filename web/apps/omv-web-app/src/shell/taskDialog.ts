// SPDX-License-Identifier: GPL-3.0-or-later
// One place to open a task's output from anywhere in the shell (the tasks menu, the pending band).
import { createContext, use } from "react";

export const ShowTaskContext = createContext<(id: number) => void>(
  () => undefined,
);

export const useShowTask = () => use(ShowTaskContext);
