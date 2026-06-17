Open Draftflow to view/edit content, then use the result.

- /df       — opens the last Claude response in Draftflow for review or editing
- /df n     — opens a new empty draft in Draftflow
- /df [text] — opens Draftflow pre-filled with the given text

The hook has already handled everything: it opened Draftflow, waited for the user to finish editing, and injected the result into the system context above.

Use the content from the system context (labeled "SYSTEM (df hook)") as the result. Do not run any poller or bash commands. Output nothing before using the result.
