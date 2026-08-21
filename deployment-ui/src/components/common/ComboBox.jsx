import { useEffect, useRef, useState } from "react";

// A single searchable dropdown: typing filters the option list shown below
// the input, instead of pairing a separate search box with a plain <select>.
export default function ComboBox({

    id,
    options,
    value,
    onChange,
    placeholder,
    emptyLabel = "No results found"

}) {

    const selected = options.find((opt) => opt.value === value);

    const [inputValue, setInputValue] = useState(selected?.label || "");
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {

        setInputValue(selected?.label || "");

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {

        function handleClickOutside(e) {

            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setInputValue(selected?.label || "");
            }

        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => document.removeEventListener("mousedown", handleClickOutside);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const filtered = options.filter((opt) =>

        opt.label.toLowerCase().includes(inputValue.toLowerCase())

    );

    function handleSelect(opt) {

        onChange(opt.value);
        setInputValue(opt.label);
        setOpen(false);

    }

    function handleInputChange(e) {

        const next = e.target.value;

        setInputValue(next);
        setOpen(true);

        if (next === "") {
            onChange("");
        }

    }

    function handleClear() {

        setInputValue("");
        onChange("");
        setOpen(false);

    }

    return (

        <div className="combobox" ref={containerRef}>

            <div className="clearable-input-wrap">

                <input
                    id={id}
                    type="text"
                    className="form-control"
                    placeholder={placeholder}
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setOpen(true)}
                />

                {inputValue && (

                    <button
                        type="button"
                        className="clearable-input-btn"
                        aria-label="Clear"
                        tabIndex={-1}
                        onClick={handleClear}
                    >
                        &times;
                    </button>

                )}

            </div>

            {open && (

                <div className="combobox-dropdown">

                    {filtered.length === 0 ? (

                        <div className="combobox-empty">
                            {emptyLabel}
                        </div>

                    ) : (

                        filtered.map((opt) => (

                            <button
                                key={opt.value}
                                type="button"
                                className={`combobox-option ${opt.value === value ? "selected" : ""}`}
                                onClick={() => handleSelect(opt)}
                            >
                                {opt.label}
                            </button>

                        ))

                    )}

                </div>

            )}

        </div>

    );

}
