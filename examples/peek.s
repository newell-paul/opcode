        .FORGE  github      

        LDA     #42         ; issue 42
        JSR     FETCH       
        JSR     FIX 
        JSR     TEST
        BCC     SKIP        ; tests failed bail
        BRK                 ; commit + halt
skip:   RTS        
