        .FORGE  github      ; declared target forge (env var still overrides)

        LDA     #42         ; issue 42
        JSR     FETCH       ; pull ticket into ISSUE
        JSR     ANALYZE     ; read title/body/comments, plan → DIFF
        RTS                 ; halt without committing
