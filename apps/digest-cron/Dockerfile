FROM curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6

COPY --chmod=0555 apps/digest-cron/run.sh /usr/local/bin/run-digest

ENTRYPOINT ["/usr/local/bin/run-digest"]
