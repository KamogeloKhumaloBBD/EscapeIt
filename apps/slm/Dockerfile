# The digest summarizer: a llama.cpp server holding one small model.
#
# It still has no public Railway domain. The API reaches it over the project's
# private network and authenticates inference requests with LLAMA_API_KEY.
FROM ghcr.io/ggml-org/llama.cpp:server@sha256:190813e82f33a82f506e66826f367004a3159f8b8139b11d07566437aecdac93

# Gemma 3 4B, chosen on how its digests read. Note it ships under Google's own
# Gemma Terms rather than a standard open-source licence, so its acceptable-use
# conditions apply to this deployment. Swapping model is these two arguments.
ARG MODEL_REPOSITORY=unsloth/gemma-3-4b-it-GGUF
ARG MODEL_REVISION=5a3566e716d80f709ed7b79817eaf7733d2a1fce
ARG MODEL_FILE=gemma-3-4b-it-Q4_K_M.gguf

# Baked into the image rather than fetched on boot. A cold start after Railway
# sleeps the service then reads from local disk instead of depending on a third
# party being up at the moment the digest runs.
ADD https://huggingface.co/${MODEL_REPOSITORY}/resolve/${MODEL_REVISION}/${MODEL_FILE} /models/model.gguf

ENV LLAMA_ARG_MODEL=/models/model.gguf \
    LLAMA_ARG_HOST=:: \
    LLAMA_ARG_PORT=8080 \
    LLAMA_ARG_UI=false \
    # Digest prompts run to a few hundred tokens. The model supports far more,
    # but the KV cache is allocated from this number, so a large context would
    # cost gigabytes of resident memory for capacity nothing uses.
    LLAMA_ARG_CTX_SIZE=8192 \
    # Four slots against four threads: the digest asks for one sentence per tool
    # in sequence, so extra parallelism would only contend for the same cores.
    LLAMA_ARG_N_PARALLEL=4 \
    LLAMA_ARG_THREADS=4

EXPOSE 8080
