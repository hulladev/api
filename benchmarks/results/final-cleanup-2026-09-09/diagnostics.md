# Performance diagnostics

These are diagnostics, not a cross-package ranking. Each row is one process; request latency includes body consumption. Fixed-concurrency rows use closed-loop localhost clients. Offered-load rows schedule arrivals independently and include scheduler/queue delay in latency; neither is a production capacity claim. Keep process rows separate when comparing distributions.

| Operation | Dimensions | Process | Throughput / s | p50 ms | p95 ms | p99 ms | Event-loop p99 ms | Heap delta bytes | RSS bytes | Failures |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| route-dispatch | {"routes":1,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 220527 | 0.003 | 0.012 | 0.024 | 0.000 | 589824 | 53395456 | 0 |
| route-dispatch | {"routes":1,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 319425 | 0.002 | 0.008 | 0.011 | 0.000 | 720896 | 55476224 | 0 |
| route-dispatch | {"routes":1,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 119513 | 0.002 | 0.007 | 0.020 | 0.000 | -82099 | 57638912 | 0 |
| route-dispatch | {"routes":32,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 420499 | 0.001 | 0.011 | 0.014 | 0.000 | 0 | 58753024 | 0 |
| route-dispatch | {"routes":32,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 581466 | 0.001 | 0.004 | 0.011 | 0.000 | 0 | 60571648 | 0 |
| route-dispatch | {"routes":32,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 468612 | 0.002 | 0.004 | 0.007 | 0.000 | 0 | 63406080 | 0 |
| route-dispatch | {"routes":256,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 146520 | 0.007 | 0.013 | 0.021 | 0.000 | 0 | 71270400 | 0 |
| route-dispatch | {"routes":256,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 703502 | 0.001 | 0.003 | 0.004 | 0.000 | 0 | 72564736 | 0 |
| route-dispatch | {"routes":256,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 534581 | 0.002 | 0.004 | 0.005 | 0.000 | 0 | 74104832 | 0 |
| route-dispatch | {"routes":2048,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 137666 | 0.008 | 0.012 | 0.017 | 0.000 | 0 | 105594880 | 0 |
| route-dispatch | {"routes":2048,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 255741 | 0.003 | 0.010 | 0.021 | 0.000 | 0 | 112754688 | 0 |
| route-dispatch | {"routes":2048,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70851 | 311143 | 0.003 | 0.008 | 0.011 | 0.000 | 0 | 121765888 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 250849 | 0.003 | 0.010 | 0.017 | 0.000 | 0 | 123650048 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 121930 | 0.007 | 0.014 | 0.033 | 0.000 | 0 | 127320064 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 315790 | 0.002 | 0.005 | 0.028 | 0.000 | 0 | 129007616 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 54833 | 0.014 | 0.020 | 0.050 | 0.000 | 0 | 144736256 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 137284 | 0.002 | 0.004 | 0.007 | 0.000 | 9033721 | 146063360 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 9493 | 0.076 | 0.171 | 0.552 | 0.000 | 6548998 | 195903488 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 534639 | 0.002 | 0.003 | 0.006 | 0.000 | 0 | 196263936 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70851 | 3113 | 0.250 | 0.675 | 0.835 | 0.000 | 14196625 | 304594944 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70851 | 296938 | 0.002 | 0.006 | 0.024 | 0.000 | 0 | 305545216 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"unbounded native reader"} | 70851 | 614675 | 0.001 | 0.003 | 0.006 | 0.000 | 0 | 305922048 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70851 | 489497 | 0.002 | 0.004 | 0.007 | 0.000 | 0 | 306479104 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"unbounded native reader"} | 70851 | 619834 | 0.001 | 0.004 | 0.006 | 0.000 | 0 | 306921472 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70851 | 111625 | 0.008 | 0.013 | 0.019 | 0.000 | 0 | 311132160 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"unbounded native reader"} | 70851 | 145622 | 0.006 | 0.011 | 0.012 | 0.000 | 0 | 312541184 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70851 | 267037 | 0.003 | 0.006 | 0.008 | 0.000 | 0 | 313556992 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"unbounded native reader"} | 70851 | 222232 | 0.004 | 0.008 | 0.009 | 0.000 | 0 | 315097088 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70851 | 9083 | 0.109 | 0.145 | 0.185 | 0.000 | 2048816 | 355254272 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"unbounded native reader"} | 70851 | 14567 | 0.062 | 0.070 | 0.119 | 0.000 | 1128738 | 356564992 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70851 | 17778 | 0.035 | 0.090 | 0.600 | 0.000 | 1877795 | 390316032 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"unbounded native reader"} | 70851 | 23316 | 0.030 | 0.079 | 0.102 | 0.000 | 425463 | 400375808 | 0 |
| route-dispatch | {"routes":1,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 174381 | 0.003 | 0.016 | 0.043 | 0.000 | 606208 | 53395456 | 0 |
| route-dispatch | {"routes":1,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 390181 | 0.002 | 0.006 | 0.008 | 0.000 | 704512 | 55345152 | 0 |
| route-dispatch | {"routes":1,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 106326 | 0.002 | 0.006 | 0.018 | 0.000 | -97369 | 57704448 | 0 |
| route-dispatch | {"routes":32,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 412300 | 0.001 | 0.009 | 0.017 | 0.000 | 0 | 58671104 | 0 |
| route-dispatch | {"routes":32,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 621521 | 0.001 | 0.003 | 0.004 | 0.000 | 0 | 59031552 | 0 |
| route-dispatch | {"routes":32,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 467518 | 0.002 | 0.004 | 0.007 | 0.000 | 0 | 60702720 | 0 |
| route-dispatch | {"routes":256,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 131183 | 0.008 | 0.015 | 0.021 | 0.000 | 0 | 70565888 | 0 |
| route-dispatch | {"routes":256,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 676915 | 0.001 | 0.003 | 0.004 | 0.000 | 0 | 71729152 | 0 |
| route-dispatch | {"routes":256,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 402111 | 0.002 | 0.004 | 0.010 | 0.000 | 0 | 73613312 | 0 |
| route-dispatch | {"routes":2048,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 143147 | 0.008 | 0.013 | 0.020 | 0.000 | 0 | 115474432 | 0 |
| route-dispatch | {"routes":2048,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 479090 | 0.002 | 0.004 | 0.005 | 0.000 | 0 | 123584512 | 0 |
| route-dispatch | {"routes":2048,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70865 | 177305 | 0.003 | 0.010 | 0.059 | 0.000 | 0 | 133414912 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 240361 | 0.003 | 0.008 | 0.016 | 0.000 | 0 | 134512640 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 111088 | 0.007 | 0.014 | 0.026 | 0.000 | 0 | 136740864 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 369259 | 0.002 | 0.005 | 0.007 | 0.000 | 0 | 137101312 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 74897 | 0.013 | 0.017 | 0.026 | 0.000 | 0 | 149897216 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 613497 | 0.001 | 0.003 | 0.004 | 0.000 | 0 | 150568960 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 10122 | 0.079 | 0.132 | 0.530 | 0.000 | 7607320 | 204767232 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 450450 | 0.002 | 0.004 | 0.006 | 0.000 | 0 | 204816384 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70865 | 2577 | 0.326 | 0.761 | 1.137 | 0.000 | 29430808 | 400359424 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70865 | 316790 | 0.002 | 0.006 | 0.017 | 0.000 | 0 | 401326080 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"unbounded native reader"} | 70865 | 499376 | 0.001 | 0.004 | 0.008 | 0.000 | 0 | 401719296 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70865 | 356560 | 0.002 | 0.004 | 0.006 | 0.000 | 0 | 402227200 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"unbounded native reader"} | 70865 | 272217 | 0.001 | 0.003 | 0.006 | 0.000 | 0 | 402440192 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70865 | 97282 | 0.010 | 0.014 | 0.020 | 0.000 | 0 | 406110208 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"unbounded native reader"} | 70865 | 145972 | 0.006 | 0.009 | 0.012 | 0.000 | 0 | 407797760 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70865 | 80167 | 0.005 | 0.010 | 0.038 | 0.000 | 445017 | 409567232 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"unbounded native reader"} | 70865 | 188739 | 0.005 | 0.007 | 0.009 | 0.000 | 0 | 410337280 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70865 | 8598 | 0.111 | 0.161 | 0.191 | 0.000 | 2011444 | 462553088 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"unbounded native reader"} | 70865 | 12413 | 0.066 | 0.124 | 0.162 | 0.000 | 708518 | 469630976 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70865 | 24303 | 0.034 | 0.058 | 0.107 | 0.000 | 1888143 | 473956352 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"unbounded native reader"} | 70865 | 25396 | 0.031 | 0.067 | 0.097 | 0.000 | 686904 | 477347840 | 0 |
| route-dispatch | {"routes":1,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 237577 | 0.002 | 0.010 | 0.019 | 0.000 | 606208 | 53395456 | 0 |
| route-dispatch | {"routes":1,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 366076 | 0.002 | 0.006 | 0.012 | 0.000 | 704512 | 55443456 | 0 |
| route-dispatch | {"routes":1,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 108543 | 0.002 | 0.006 | 0.018 | 0.000 | -109186 | 57589760 | 0 |
| route-dispatch | {"routes":32,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 439802 | 0.001 | 0.010 | 0.015 | 0.000 | 0 | 58785792 | 0 |
| route-dispatch | {"routes":32,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 567376 | 0.002 | 0.004 | 0.006 | 0.000 | 0 | 59228160 | 0 |
| route-dispatch | {"routes":32,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 476900 | 0.002 | 0.004 | 0.007 | 0.000 | 0 | 61079552 | 0 |
| route-dispatch | {"routes":256,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 128243 | 0.008 | 0.016 | 0.033 | 0.000 | 0 | 70959104 | 0 |
| route-dispatch | {"routes":256,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 659341 | 0.001 | 0.003 | 0.004 | 0.000 | 0 | 72171520 | 0 |
| route-dispatch | {"routes":256,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 570072 | 0.002 | 0.003 | 0.005 | 0.000 | 0 | 73711616 | 0 |
| route-dispatch | {"routes":2048,"middleware":0,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 141226 | 0.007 | 0.014 | 0.023 | 0.000 | 0 | 106414080 | 0 |
| route-dispatch | {"routes":2048,"middleware":1,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 433722 | 0.002 | 0.004 | 0.005 | 0.000 | 0 | 113655808 | 0 |
| route-dispatch | {"routes":2048,"middleware":5,"distribution":"uniform hits + 10% misses + 10% wrong method"} | 70880 | 294551 | 0.003 | 0.007 | 0.018 | 0.000 | 0 | 123027456 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 248113 | 0.003 | 0.010 | 0.014 | 0.000 | 0 | 124960768 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1024,"serializedBytes":1036,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 133433 | 0.007 | 0.013 | 0.016 | 0.000 | 0 | 128499712 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 372324 | 0.002 | 0.005 | 0.007 | 0.000 | 0 | 130007040 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":16384,"serializedBytes":16396,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 38533 | 0.013 | 0.023 | 0.071 | 0.000 | 9339715 | 145031168 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 563182 | 0.002 | 0.003 | 0.004 | 0.000 | 0 | 145637376 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":262144,"serializedBytes":262156,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 10009 | 0.088 | 0.140 | 0.484 | 0.000 | 2971490 | 215597056 | 0 |
| payload-roundtrip | {"transport":"in-process","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 527936 | 0.001 | 0.003 | 0.005 | 0.000 | 0 | 217759744 | 0 |
| payload-roundtrip | {"transport":"fetch","bytes":1048576,"serializedBytes":1048588,"bodyLimit":"unbounded (includes 1 MiB payload plus JSON envelope)"} | 70880 | 2877 | 0.253 | 0.769 | 0.950 | 0.000 | 20318725 | 363298816 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70880 | 288895 | 0.002 | 0.006 | 0.019 | 0.000 | 0 | 364183552 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":1024,"policy":"unbounded native reader"} | 70880 | 604992 | 0.001 | 0.003 | 0.006 | 0.000 | 0 | 364642304 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70880 | 397878 | 0.002 | 0.004 | 0.011 | 0.000 | 0 | 365166592 | 0 |
| chunked-fetch-body | {"payloadBytes":256,"wireBytes":268,"chunkBytes":65536,"policy":"unbounded native reader"} | 70880 | 616966 | 0.001 | 0.003 | 0.009 | 0.000 | 0 | 365592576 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70880 | 91799 | 0.010 | 0.014 | 0.022 | 0.000 | 0 | 372391936 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":1024,"policy":"unbounded native reader"} | 70880 | 137615 | 0.007 | 0.011 | 0.013 | 0.000 | 0 | 374243328 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70880 | 159469 | 0.005 | 0.011 | 0.022 | 0.000 | 0 | 376176640 | 0 |
| chunked-fetch-body | {"payloadBytes":16384,"wireBytes":16396,"chunkBytes":65536,"policy":"unbounded native reader"} | 70880 | 239569 | 0.003 | 0.007 | 0.014 | 0.000 | 0 | 377176064 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"bounded 1 MiB reader"} | 70880 | 9500 | 0.088 | 0.140 | 0.185 | 0.000 | 1004881 | 412270592 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":1024,"policy":"unbounded native reader"} | 70880 | 13588 | 0.064 | 0.099 | 0.128 | 0.000 | 984259 | 413270016 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"bounded 1 MiB reader"} | 70880 | 19515 | 0.036 | 0.084 | 0.140 | 0.000 | 1231543 | 418693120 | 0 |
| chunked-fetch-body | {"payloadBytes":262144,"wireBytes":262156,"chunkBytes":65536,"policy":"unbounded native reader"} | 70880 | 23319 | 0.030 | 0.071 | 0.196 | 0.000 | 1373659 | 428769280 | 0 |
| socket-load | {"implementation":"direct","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 70887 | 14609 | 0.061 | 0.101 | 0.195 | 0.000 | 0 | 59654144 | 0 |
| socket-load | {"implementation":"direct","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 70887 | 53836 | 0.237 | 0.676 | 0.979 | 0.000 | 0 | 61947904 | 0 |
| socket-load | {"implementation":"direct","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 70887 | 59780 | 0.804 | 1.422 | 2.060 | 0.000 | 0 | 67354624 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":100,"durationMs":1000} | 70887 | 101 | 0.196 | 0.426 | 1.392 | 1.008 | -671325 | 68681728 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":1000,"durationMs":1000} | 70887 | 1001 | -0.584 | -0.460 | -0.389 | 1.012 | 273054 | 73302016 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":5000,"durationMs":1000} | 70887 | 5003 | -0.237 | 0.203 | 0.317 | 1.021 | 2312236 | 83296256 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 70887 | 13586 | 0.069 | 0.104 | 0.169 | 0.000 | 0 | 84508672 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 70887 | 42686 | 0.312 | 0.840 | 1.007 | 0.000 | 0 | 85016576 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 70887 | 40207 | 1.234 | 3.061 | 3.067 | 0.000 | 0 | 86409216 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":100,"durationMs":1000} | 70887 | 101 | 0.152 | 1.297 | 2.645 | 1.363 | 773003 | 76267520 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":1000,"durationMs":1000} | 70887 | 1001 | -0.482 | -0.297 | 0.620 | 0.835 | 277660 | 76890112 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":5000,"durationMs":1000} | 70887 | 5002 | -0.175 | 1.092 | 14.736 | 5.431 | -1323979 | 83853312 | 0 |
| socket-load | {"implementation":"direct","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 71100 | 11994 | 0.072 | 0.139 | 0.210 | 0.000 | 0 | 58818560 | 0 |
| socket-load | {"implementation":"direct","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 71100 | 38678 | 0.351 | 0.946 | 1.025 | 0.000 | 0 | 61390848 | 0 |
| socket-load | {"implementation":"direct","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 71100 | 20165 | 4.000 | 5.182 | 5.187 | 0.000 | 0 | 66732032 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":100,"durationMs":1000} | 71100 | 101 | 0.335 | 1.703 | 4.384 | 1.889 | -673299 | 67993600 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":1000,"durationMs":1000} | 71100 | 1001 | -0.326 | 0.186 | 5.875 | 1.069 | 376024 | 56475648 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":5000,"durationMs":1000} | 71100 | 5003 | -0.156 | 6.236 | 23.365 | 5.882 | 2181674 | 66633728 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 71100 | 13342 | 0.071 | 0.109 | 0.153 | 0.000 | 0 | 69992448 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 71100 | 47370 | 0.284 | 0.693 | 0.886 | 0.000 | 0 | 70549504 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 71100 | 51209 | 1.069 | 2.260 | 2.265 | 0.000 | 0 | 71401472 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":100,"durationMs":1000} | 71100 | 101 | 0.218 | 1.984 | 10.885 | 5.812 | 749326 | 69074944 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":1000,"durationMs":1000} | 71100 | 1001 | -0.430 | -0.203 | 0.428 | 1.025 | 231366 | 71008256 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":5000,"durationMs":1000} | 71100 | 5004 | -0.203 | 0.313 | 1.391 | 1.217 | 2263169 | 79282176 | 0 |
| socket-load | {"implementation":"direct","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 71315 | 11383 | 0.076 | 0.137 | 0.242 | 0.000 | 0 | 59195392 | 0 |
| socket-load | {"implementation":"direct","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 71315 | 47097 | 0.263 | 0.860 | 1.050 | 0.000 | 0 | 61767680 | 0 |
| socket-load | {"implementation":"direct","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 71315 | 46063 | 0.906 | 2.821 | 2.823 | 0.000 | 0 | 66945024 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":100,"durationMs":1000} | 71315 | 101 | 0.301 | 0.666 | 1.965 | 1.017 | -678226 | 68255744 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":1000,"durationMs":1000} | 71315 | 1001 | -0.487 | 0.565 | 2.214 | 1.317 | 277344 | 73252864 | 0 |
| socket-offered-load | {"implementation":"direct","offeredPerSecond":5000,"durationMs":1000} | 71315 | 5002 | -0.235 | 0.209 | 1.580 | 1.034 | 2230171 | 77955072 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":1,"policy":"server input/output validation; client JSON decode"} | 71315 | 10659 | 0.087 | 0.147 | 0.178 | 0.000 | 0 | 79151104 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":16,"policy":"server input/output validation; client JSON decode"} | 71315 | 45391 | 0.293 | 0.818 | 1.043 | 0.000 | 0 | 79609856 | 0 |
| socket-load | {"implementation":"@hulla/api","concurrency":64,"policy":"server input/output validation; client JSON decode"} | 71315 | 44874 | 1.103 | 2.195 | 2.200 | 0.000 | 0 | 80920576 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":100,"durationMs":1000} | 71315 | 101 | 0.217 | 0.482 | 1.822 | 1.151 | 773824 | 69828608 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":1000,"durationMs":1000} | 71315 | 1001 | -0.476 | -0.071 | 1.040 | 0.540 | 302193 | 74809344 | 0 |
| socket-offered-load | {"implementation":"@hulla/api","offeredPerSecond":5000,"durationMs":1000} | 71315 | 5000 | -0.147 | 0.893 | 2.360 | 1.096 | 2289789 | 85065728 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":1} | 71499 | 32695 | 0.015 | 0.047 | 0.157 | 0.000 | 1440387 | 58310656 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":16} | 71499 | 95820 | 0.165 | 0.215 | 0.221 | 0.000 | 0 | 59736064 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":1} | 71499 | 16358 | 0.031 | 0.151 | 0.440 | 0.000 | -756172 | 87212032 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":16} | 71499 | 19700 | 0.607 | 1.892 | 1.966 | 0.000 | -1094372 | 100319232 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":1} | 71500 | 37379 | 0.015 | 0.036 | 0.208 | 0.000 | 1453255 | 58376192 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":16} | 71500 | 106964 | 0.150 | 0.161 | 0.164 | 0.000 | 0 | 59555840 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":1} | 71500 | 22100 | 0.027 | 0.067 | 0.410 | 0.000 | -754896 | 84164608 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":16} | 71500 | 21522 | 0.548 | 1.458 | 1.507 | 0.000 | -1196025 | 99057664 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":1} | 71501 | 38835 | 0.015 | 0.034 | 0.068 | 0.000 | 1456362 | 58474496 | 0 |
| message-port-roundtrip | {"bytes":128,"concurrency":16} | 71501 | 95764 | 0.158 | 0.248 | 0.258 | 0.000 | 0 | 59686912 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":1} | 71501 | 21659 | 0.028 | 0.065 | 0.401 | 0.000 | -755587 | 85393408 | 0 |
| message-port-roundtrip | {"bytes":65536,"concurrency":16} | 71501 | 21121 | 0.561 | 1.495 | 1.705 | 0.000 | -829534 | 101236736 | 0 |
| stream-lifetime | {"cancel":"false","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71515 | 49 | 19.930 | 22.276 | 23.543 | 1.015 | -1233049 | 55902208 | 0 |
| stream-lifetime | {"cancel":"true","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71515 | 868 | 1.152 | 1.182 | 1.208 | 0.802 | 45469 | 56229888 | 0 |
| handler-failure | {} | 71515 | 171062 | 0.004 | 0.010 | 0.057 | 0.000 | 0 | 56819712 | 0 |
| invalid-input | {} | 71515 | 85314 | 0.009 | 0.031 | 0.052 | 0.000 | 0 | 59834368 | 0 |
| abort | {} | 71515 | 254669 | 0.003 | 0.007 | 0.011 | 0.000 | 0 | 61603840 | 0 |
| stream-lifetime | {"cancel":"false","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71661 | 51 | 19.427 | 20.178 | 21.946 | 0.812 | -1228524 | 61636608 | 0 |
| stream-lifetime | {"cancel":"true","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71661 | 798 | 1.198 | 1.415 | 2.545 | 0.950 | 20029 | 61882368 | 0 |
| handler-failure | {} | 71661 | 104680 | 0.008 | 0.017 | 0.021 | 0.000 | 0 | 62701568 | 0 |
| invalid-input | {} | 71661 | 62769 | 0.012 | 0.024 | 0.105 | 0.000 | 0 | 65847296 | 0 |
| abort | {} | 71661 | 211977 | 0.004 | 0.008 | 0.011 | 0.000 | 0 | 67551232 | 0 |
| stream-lifetime | {"cancel":"false","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71820 | 51 | 19.480 | 20.415 | 21.509 | 1.064 | -1227385 | 62914560 | 0 |
| stream-lifetime | {"cancel":"true","bytes":65536,"producerDelayMs":1,"consumerDelayMs":1} | 71820 | 850 | 1.161 | 1.224 | 1.366 | 1.892 | 24653 | 63143936 | 0 |
| handler-failure | {} | 71820 | 214996 | 0.004 | 0.009 | 0.015 | 0.000 | 0 | 63913984 | 0 |
| invalid-input | {} | 71820 | 78894 | 0.011 | 0.026 | 0.042 | 0.000 | 0 | 66355200 | 0 |
| abort | {} | 71820 | 215527 | 0.004 | 0.010 | 0.013 | 0.000 | 0 | 68026368 | 0 |

Event-loop histograms use 10 ms resolution; very short runs cannot resolve meaningful event-loop delay. Heap deltas include GC timing and are not allocation counts or leak verdicts. Raw observations, cold-process timings and complete TypeScript diagnostics are in the JSON artifact.

Browser Fetch client: 24120 minified bytes; 8120 gzip bytes.

| Cold process | Process to first response ms | Imports ms | Construction ms | First call ms |
|---:|---:|---:|---:|---:|
| 71953 | 16.28 | 4.28 | 1.37 | 1.12 |
| 71954 | 14.86 | 3.79 | 1.50 | 1.27 |
| 71955 | 13.13 | 3.32 | 1.29 | 1.03 |
