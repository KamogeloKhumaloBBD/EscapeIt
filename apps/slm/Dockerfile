# The digest summarizer: a llama.cpp server holding one small model.
#
# It has no authentication of its own, so it must never be given a public
# Railway domain. The API reaches it over the project's private network.
FROM ghcr.io/ggml-org/llama.cpp:server

# Gemma 3 4B, chosen on how its digests read. Note it ships under Google's own
# Gemma Terms rather than a standard open-source licence, so its acceptable-use
# conditions apply to this deployment. Swapping model is these two arguments.
ARG MODEL_REPOSITORY=unsloth/gemma-3-4b-it-GGUF
ARG MODEL_FILE=gemma-3-4b-it-Q4_K_M.gguf

# Baked into the image rather than fetched on boot. A cold start after Railway
# sleeps the service then reads from local disk instead of depending on a third
# party being up at the moment the digest runs.
ADD https://huggingface.co/${MODEL_REPOSITORY}/resolve/main/${MODEL_FILE} /models/model.gguf

ENV LLAMA_ARG_MODEL=/models/model.gguf \
    LLAMA_ARG_HOST=0.0.0.0 \
    LLAMA_ARG_PORT=8080 \
    # Digest prompts run to a few hundred tokens. The model supports far more,
    # but the KV cache is allocated from this number, so a large context would
    # cost gigabytes of resident memory for capacity nothing uses.
    LLAMA_ARG_CTX_SIZE=8192 \
    # Four slots against four threads: the digest asks for one sentence per tool
    # in sequence, so extra parallelism would only contend for the same cores.
    LLAMA_ARG_N_PARALLEL=4 \
    LLAMA_ARG_THREADS=4

EXPOSE 8080
