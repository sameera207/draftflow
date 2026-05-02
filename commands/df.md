Open the current selection or a new draft in Draftflow, wait for the user to edit it, then use the result.

The hook has already handled everything: it opened Draftflow, waited for the user to finish editing, and injected the result into the system context above.

Use the content from the system context (labeled "SYSTEM (df hook)") as the result. Do not run any poller or bash commands. Output nothing before using the result.
