import { useContext } from "react";
import { StyleContext } from "../context/StyleContext";

export default function useStyle(){

    return useContext(StyleContext);

}
