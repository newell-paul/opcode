        .FORGE  github
        .IRQ    urgent_handler
        .DRYRUN ON                   ; flip OFF for real

        LDA     #BUG                 ; label mask
        STA     LABELS
        JSR     FETCH                ; populate QUEUE with bug IDs

        LDX     #0
walk:   LDA     QUEUE,X              ; next bug
        BEQ     done                 ; empty slot → drained
        JSR     ANALYZE
        JSR     FIX
        JSR     LINT                 ; Z=1 if clean
        BNE     skip                 ; lint dirty → skip
        JSR     TEST                 ; C=1 on pass
        BCC     skip                 ; tests failed → skip
        JSR     REVIEW               ; C=1 on clean
        BCC     skip                 ; review concern → skip
        BRK                          ; commit this fix
skip:   INX
        CPX     #16                  ; queue bounds
        BNE     walk

done:   JSR     PUSH                 ; batch-open PRs for all commits
        RTS

urgent_handler:
        JSR     ANALYZE              ; A holds urgent ID
        JSR     FIX
        JSR     TEST
        BCC     bail                 ; even urgents must pass tests
        BRK                          ; commit
        JSR     PUSH                 ; push this one immediately
        RTI                          ; resume batch walk
bail:   RTI                          ; leave for human, resume walk
