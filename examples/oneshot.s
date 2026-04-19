        .FORGE  github      ; declared target forge (env var still overrides)
        .DRYRUN ON          ; dry-run until you're sure; flip OFF for real

        LDA     #42         ; issue 42
        JSR     FETCH       ; pull issue into ISSUE
        JSR     ANALYZE     ; plan → DIFF
        JSR     FIX         ; edit file at FILE
        JSR     TEST        ; run tests; sets C
        BCC     retry       ; tests failed → retry branch
        JSR     REVIEW      ; self-review; sets C
        BCC     retry       ; concerns → retry branch
        BRK                 ; commit + halt

retry:  JSR     FIX         ; one more attempt
        JSR     TEST
        BCC     bail        ; still failing → bail
        JSR     REVIEW
        BCC     bail        ; still concerns → bail
        BRK                 ; commit + halt

bail: RTS                   ; leave uncommitted branch for a human
