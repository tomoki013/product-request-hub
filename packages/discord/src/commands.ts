import { ApplicationCommandType } from "./types";

export const REQUEST_COMMAND_NAME = "request";
export const MESSAGE_COMMAND_NAME = "機能要望として登録";

/** Commands registered with `pnpm discord:register`. */
export const COMMANDS = [
  {
    name: REQUEST_COMMAND_NAME,
    type: ApplicationCommandType.ChatInput,
    description: "機能要望をProduct Requestとして登録します",
    contexts: [0], // guild only
  },
  {
    name: MESSAGE_COMMAND_NAME,
    type: ApplicationCommandType.Message,
    contexts: [0],
  },
] as const;
