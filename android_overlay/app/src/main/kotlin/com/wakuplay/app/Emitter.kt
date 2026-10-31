package com.wakuplay.app

/** Kirim event native -> JS (lewat Flutter). [json] harus berupa JSON valid. */
fun interface Emitter {
    fun emit(plugin: String, event: String, json: String)
}
