// A *prompt* describes the data for one or more related prompt tasks. A cloze prompt, for example, generates many tasks (one for each deletion).

import { AttachmentIDReference } from "./attachmentIDReference";

export interface PromptField {
  contents: string;
  attachments: AttachmentIDReference[];
}

export interface QAPrompt {
  question: PromptField;
  answer: PromptField;
  explanation: PromptField | null;
}

export const basicPromptType = "basic";
export interface BasicPrompt extends QAPrompt {
  promptType: typeof basicPromptType;
}

export const applicationPromptType = "applicationPrompt";
export interface ApplicationPrompt {
  promptType: typeof applicationPromptType;
  variants: QAPrompt[];
}

export const clozePromptType = "cloze";
export interface ClozePrompt {
  promptType: typeof clozePromptType;
  body: PromptField;
}

export type Prompt = BasicPrompt | ApplicationPrompt | ClozePrompt;
export type PromptType = Prompt["promptType"];

/*

given a task, to write a prompt's state:
* basic prompts: hash the data, write as usual
* cloze prompts: hash the contents, write to contentsHash/clozeIndex
* application propmts: hash the prompt data, write to contentsHash/variantIndex

given a log entry:
* separate the paths. read the first path segment.
* if it's a basic prompt, record the data as usual
    e.g. p111
* if it's a cloze prompt, record the data in the variant's card states
    e.g. p111/0
* if it's an application prompt, record the data in the parent, including the next prompt index
    e.g. p000/0

to make the task:
* separate the path components. look at the first segment.
* if it's a basic prompt, trivial
* if it's a cloze prompt, trivial
* if it's an application prompt, get appropriate child

 */