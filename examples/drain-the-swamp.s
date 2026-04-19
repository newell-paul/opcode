        .FORGE  github      ; declared target forge (env var still overrides)
        .DRYRUN ON          ; flip OFF for real

        LDA     #BUG        ; label mask
        STA     LABELS      ; set label filter
        JSR     FETCH       ; populate QUEUE with issue IDs

; Push fetched issues onto the todo stack (depth-first triage order)
        LDX     #0
push:   LDA     QUEUE,X     ; load Xth fetched issue
        BEQ     drain       ; empty slot → start draining
        PHA                 ; push as todo
        INX
        CPX     #16         ; queue bounds (16 slots)
        BNE     push

; Drain the stack: PLA + BCC/BCS work each issue, skip on failure
drain:  PLA                 ; pop newest → A (zero = empty)
        BEQ     done
        JSR     ANALYZE
        JSR     FIX
        JSR     TEST
        BCC     drain       ; failed → skip, next todo
        JSR     REVIEW
        BCC     drain       ; concerns → skip
        BRK                 ; commit this one
        JMP     drain       ; keep going

done:   JSR     PUSH        ; open PRs for committed branches
        RTS
